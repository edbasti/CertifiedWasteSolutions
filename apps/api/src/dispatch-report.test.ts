import { describe, expect, it } from "vitest";
import {
  buildPickupDescription,
  matchDriversToDispatch,
  parseDispatchCsv,
  parseDispatchMatrix,
} from "./dispatch-report";

const sampleCsv = `Driver,In/Out,N° Dispatch,Run,Stop,Date,Customer,Address,City,Destination,Commodity,Container Type,Container Qty,Action,Dispatch notes,Dispatch type,Priority,Dispatched By
Andres Hernandez,IN,000120,1,1,2026-10-12,Legacy Farms - 1745,1745 W Penhall Way,Anaheim,,OCC-Loose,,,Dump & Return,must arrive before 8am,Swap,P3 - Standard,Marina Neri
alex.rivera@cws.local,IN,000121,1,2,2026-10-12,Metro Foods,18 Harbor Industrial Rd,Bayport,,Cardboard,,,Pickup,,P/U Only,,Dispatcher
`;

describe("dispatch truck report", () => {
  it("parses NetSuite dispatch columns into stop rows", () => {
    const parsed = parseDispatchCsv(sampleCsv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      driverName: "Andres Hernandez",
      serviceDate: "2026-10-12",
      customerName: "Legacy Farms - 1745",
      sequence: 1,
    });
    expect(parsed.rows[0]?.pickupDescription).toContain("Dump & Return");
    expect(parsed.rows[0]?.pickupDescription).toContain("OCC-Loose");
    expect(parsed.rows[1]?.driverEmail).toBe("alex.rivera@cws.local");
  });

  it("gives unique sequences when NetSuite repeats Stop=1 across runs", () => {
    const csv = `Driver,Run,Stop,Date,Customer,Address,City,Commodity,Action
3RD-GG Express,1,1,2026-10-13,Legacy Farms,1745 W Penhall Way,Anaheim,CBS,Dump & Return
3RD-GG Express,3,1,2026-10-13,Legacy Farms,1745 W Penhall Way,Anaheim,OCC-Loose,Dump & Return
3RD-GG Express,2,1,2026-10-13,Legacy Farms,1745 W Penhall Way,Anaheim,OCC-Loose,Dump & Return
`;
    const parsed = parseDispatchCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((row) => row.sequence).sort()).toEqual([1, 2, 3]);
    expect(new Set(parsed.rows.map((row) => row.sequence)).size).toBe(3);
  });

  it("matches drivers by email or normalized name", () => {
    const parsed = parseDispatchCsv(sampleCsv);
    const matches = matchDriversToDispatch(parsed.rows, [
      { id: "d1", name: "Alex Rivera", email: "alex.rivera@cws.local" },
      { id: "d2", name: "Andres Hernandez", email: "andres@cws.local" },
    ]);
    expect(matches.find((item) => item.driverName === "Andres Hernandez")).toMatchObject({
      driverId: "d2",
      matchedBy: "name",
    });
    expect(matches.find((item) => item.driverName === "alex.rivera@cws.local")).toMatchObject({
      driverId: "d1",
      matchedBy: "email",
    });
  });

  it("builds pickup text from commodity and action", () => {
    expect(
      buildPickupDescription({
        action: "Remove",
        commodity: "OCC-Baled",
        notes: "Hrs. 5am-5pm",
        dispatchType: "P/U Only - No Return",
        containerType: "Bale",
        containerQty: "8",
      }),
    ).toBe("Remove · OCC-Baled · 8 Bale · P/U Only - No Return · Hrs. 5am-5pm");
  });

  it("reads matrix rows the same way as CSV", () => {
    const matrix = [
      ["Driver", "Date", "Customer", "Address", "City", "Commodity", "Action", "Stop"],
      ["Sam Thompson", "10/08/2026", "Harbor City Market", "7 Dockside Parkway", "Bayport", "Mixed", "Dump & Return", "1"],
    ];
    const parsed = parseDispatchMatrix(matrix);
    expect(parsed.rows[0]).toMatchObject({
      driverName: "Sam Thompson",
      serviceDate: "2026-10-08",
      customerName: "Harbor City Market",
      sequence: 1,
    });
  });
});
