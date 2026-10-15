import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDispatchMatrix } from "./dispatch-report";
import { matrixFromSpreadsheet, workbookFromDispatchRows } from "./spreadsheet";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures/dispatch_truck_report_sample.xlsx");

describe("spreadsheet dispatch files", () => {
  it("reads the sample NetSuite Excel export", async () => {
    const matrix = await matrixFromSpreadsheet(readFileSync(fixture), "dispatch_truck_report_sample.xlsx");
    const parsed = parseDispatchMatrix(matrix);
    // Sample includes incomplete NetSuite rows (missing address/city); usable rows still import.
    expect(parsed.rows.length).toBeGreaterThan(40);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.rows[0]?.driverName).toBeTruthy();
    expect(parsed.rows[0]?.serviceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.rows[0]?.customerName).toBeTruthy();
  });

  it("writes an Excel workbook that can be read back", async () => {
    const bytes = await workbookFromDispatchRows([
      {
        Driver: "Alex Rivera",
        "In/Out": "IN",
        "N° Dispatch": "0001",
        Run: "1",
        Stop: "1",
        Date: "2026-10-10",
        Customer: "Metro Foods",
        Address: "18 Harbor Industrial Rd",
        City: "Bayport",
        Destination: "",
        Commodity: "Cardboard",
        "Container Type": "",
        "Container Qty": "",
        Action: "Dump & Return",
        "Dispatch notes": "",
        "Dispatch type": "",
        Priority: "",
        "Dispatched By": "",
      },
    ]);
    const matrix = await matrixFromSpreadsheet(bytes, "export.xlsx");
    const parsed = parseDispatchMatrix(matrix);
    expect(parsed.rows[0]).toMatchObject({
      driverName: "Alex Rivera",
      customerName: "Metro Foods",
      serviceDate: "2026-10-10",
    });
  });
});
