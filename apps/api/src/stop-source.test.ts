import { describe, expect, it } from "vitest";
import { csvStopSource, netsuiteStopSource, StopSourceError } from "./stop-source";

describe("stop sources", () => {
  it("plans a CSV route and keeps quoted addresses", () => {
    const result = csvStopSource.plan(
      'driverEmail,serviceDate,customer,address,pickup\nsam.thompson@cws.local,2026-10-06,Metro Foods,"18 Harbor Industrial Rd, Bayport",Cardboard\n',
    );
    expect(result.errors).toEqual([]);
    expect(result.plans[0]?.stops[0]).toMatchObject({
      sequence: 1,
      customerName: "Metro Foods",
      address: "18 Harbor Industrial Rd, Bayport",
      pickupDescription: "Cardboard",
    });
  });

  it("points NetSuite imports at the dispatch file workflow", () => {
    expect(netsuiteStopSource.available).toBe(true);
    expect(() => netsuiteStopSource.plan("")).toThrow(StopSourceError);
  });
});
