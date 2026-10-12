import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { logFieldMap, logTypeLabels, type DriverLog, type DriverLogLine, type LogField } from "@cws/shared";

function dollars(cents: number | null): string {
  if (cents === null) {
    return "";
  }
  return `$${(cents / 100).toFixed(2)}`;
}

function fieldText(field: LogField, line: DriverLogLine): string {
  if (field.key === "price") {
    return dollars(line.priceCents);
  }
  if (field.key === "multiStopLoad") {
    return line.multiStopLoad ? "Yes" : "No";
  }
  const value = line[field.key as keyof DriverLogLine];
  return typeof value === "string" ? value : "";
}

async function drawDocument(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 750;

  const write = (text: string, size: number, heavy = false) => {
    if (y < 56) {
      page = doc.addPage([612, 792]);
      y = 750;
    }
    page.drawText(text.slice(0, 110), {
      x: 48,
      y,
      size,
      font: heavy ? bold : font,
      color: rgb(0.01, 0.15, 0.34),
    });
    y -= size + 8;
  };

  write("Certified Waste Solutions", 16, true);
  write(title, 13, true);
  y -= 6;
  for (const line of lines) {
    write(line || " ", 10);
  }
  const bytes = await doc.save();
  return bytes;
}

export function priceTotalCents(log: DriverLog): number {
  return log.lines.reduce((total, line) => total + (line.priceCents ?? 0), 0);
}

export function invoiceDocumentLines(log: DriverLog, invoiceNumber: string): string[] {
  const fields = logFieldMap[log.logType].filter((field) => field.scope === "line");
  const lines = [
    "Stand-in layout until the invoice template arrives.",
    `Invoice ${invoiceNumber}`,
    `Driver: ${log.driverName}`,
    `Log: ${logTypeLabels[log.logType]}`,
    `Service date: ${log.serviceDate}`,
    "",
  ];
  for (const [index, line] of log.lines.entries()) {
    lines.push(`Line ${index + 1}`);
    for (const field of fields) {
      lines.push(`${field.label}: ${fieldText(field, line)}`);
    }
    lines.push("");
  }
  lines.push(`Total: ${dollars(priceTotalCents(log))}`);
  return lines;
}

export function logDocumentLines(log: DriverLog): string[] {
  const header = logFieldMap[log.logType].find((field) => field.filledBy === "manager");
  const payment = log.logType === "port" ? log.paymentDateFriday : log.datePaid;
  const fields = logFieldMap[log.logType].filter((field) => field.scope === "line");
  const lines = [
    `Driver: ${log.driverName}`,
    `Company: ${log.driverCompanyName}`,
    `Log: ${logTypeLabels[log.logType]}`,
    `Service date: ${log.serviceDate}`,
    `${header?.label ?? "Payment date"}: ${payment ?? ""}`,
    "",
  ];
  for (const [index, line] of log.lines.entries()) {
    lines.push(`Line ${index + 1}`);
    for (const field of fields) {
      lines.push(`${field.label}: ${fieldText(field, line)}`);
    }
    lines.push("");
  }
  lines.push(`Total: ${dollars(priceTotalCents(log))}`);
  return lines;
}

export async function buildInvoicePdf(log: DriverLog, invoiceNumber: string): Promise<Uint8Array> {
  return drawDocument("Invoice", invoiceDocumentLines(log, invoiceNumber));
}

export async function buildLogPdf(log: DriverLog): Promise<Uint8Array> {
  return drawDocument("Driver log", logDocumentLines(log));
}
