import ExcelJS from "exceljs";
import { dispatchReportHeaders } from "./dispatch-report";

export async function matrixFromSpreadsheet(bytes: ArrayBuffer | Buffer, filename: string): Promise<string[][]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("utf8");
    const { parseCsv } = await import("./csv");
    return parseCsv(text).map((record) => record.cells.map((value) => value.trim()));
  }
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
    throw new Error("Use an Excel (.xlsx) or CSV file exported from NetSuite.");
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("That spreadsheet has no worksheet to import.");
  }

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const count = Math.max(row.cellCount, dispatchReportHeaders.length);
    for (let index = 1; index <= count; index += 1) {
      values.push(cellToText(row.getCell(index).value));
    }
    matrix.push(values);
  });
  return matrix;
}

function cellToText(value: ExcelJS.CellValue): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("result" in value && value.result != null) {
      return cellToText(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

export async function workbookFromDispatchRows(rows: Record<string, string>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Certified Waste Solutions";
  const sheet = workbook.addWorksheet("Dispatch Truck Report");
  sheet.addRow([...dispatchReportHeaders]);
  const header = sheet.getRow(1);
  header.font = { name: "Arial", bold: true, size: 11 };
  for (const row of rows) {
    sheet.addRow(dispatchReportHeaders.map((key) => row[key] ?? ""));
  }
  sheet.columns = dispatchReportHeaders.map((key) => ({
    header: key,
    key,
    width: Math.min(36, Math.max(12, key.length + 4)),
  }));
  for (const row of sheet.getRows(2, Math.max(rows.length, 1)) ?? []) {
    row.font = { name: "Arial", size: 10 };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
