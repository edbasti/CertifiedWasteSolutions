import { describe, expect, it } from "vitest";
import { columnIndex, parseActive, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("keeps commas and quotes inside a cell", () => {
    const records = parseCsv('name,address\n"Metro Foods","18 Harbor Industrial Rd, Bayport"\n');
    expect(records).toEqual([
      { line: 1, cells: ["name", "address"] },
      { line: 2, cells: ["Metro Foods", "18 Harbor Industrial Rd, Bayport"] },
    ]);
  });

  it("ignores blank rows and a byte-order mark", () => {
    const records = parseCsv("\uFEFFname,address\n\nPier Warehouse,1 Pier St\r\n");
    expect(records.map((record) => record.cells[0])).toEqual(["name", "Pier Warehouse"]);
    expect(records[1]?.line).toBe(3);
  });
});

describe("csv columns", () => {
  it("matches common header names", () => {
    expect(columnIndex(["Customer Name", "Service Address"], ["name", "customername"])).toBe(0);
    expect(parseActive("inactive")).toBe(false);
    expect(parseActive("")).toBeUndefined();
  });
});
