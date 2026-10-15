import type { DispatchDriverMatch, DispatchImportPreview, DispatchImportRow } from "@cws/shared";
import { columnIndex, parseCsv } from "./csv";
import { validServiceDate } from "./stop-source";

export const dispatchReportHeaders = [
  "Driver",
  "In/Out",
  "N° Dispatch",
  "Run",
  "Stop",
  "Date",
  "Customer",
  "Address",
  "City",
  "Destination",
  "Commodity",
  "Container Type",
  "Container Qty",
  "Action",
  "Dispatch notes",
  "Dispatch type",
  "Priority",
  "Dispatched By",
] as const;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[°º]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function cell(row: string[], index: number): string {
  if (index < 0) {
    return "";
  }
  return (row[index] ?? "").trim();
}

function parseWholeNumber(value: string): number | null {
  if (!value) {
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    return null;
  }
  return number;
}

function excelSerialToDate(value: string): string | null {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) {
    return null;
  }
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return utc.toISOString().slice(0, 10);
}

function normalizeServiceDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (validServiceDate(value)) {
    return value;
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return validServiceDate(date) ? date : null;
  }
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    const date = `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
    return validServiceDate(date) ? date : null;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const stamp = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate(),
    ).padStart(2, "0")}`;
    return validServiceDate(stamp) ? stamp : null;
  }
  return excelSerialToDate(value);
}

export function normalizeDriverKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^(ind|3rd)\s*[-–]\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPickupDescription(parts: {
  action: string;
  commodity: string;
  notes: string;
  dispatchType: string;
  containerType: string;
  containerQty: string;
}): string {
  const chunks = [
    parts.action,
    parts.commodity,
    parts.containerQty && parts.containerType
      ? `${parts.containerQty} ${parts.containerType}`
      : parts.containerType || parts.containerQty,
    parts.dispatchType,
    parts.notes,
  ].filter((part) => part.trim().length > 0);
  return chunks.join(" · ") || "Dispatch stop";
}

export function formatDispatchAddress(address: string, city: string): string {
  if (address && city && !address.toLowerCase().includes(city.toLowerCase())) {
    return `${address}, ${city}`;
  }
  return address || city;
}

export function parseDispatchMatrix(matrix: string[][]): Omit<DispatchImportPreview, "drivers"> {
  const headerRow = matrix.find((row) => row.some((entry) => entry.trim()));
  if (!headerRow) {
    throw new Error("The first row must include Driver, Date, Customer, and Address (or City).");
  }
  const header = headerRow.map(normalizeHeader);
  const driverIndex = columnIndex(header, ["driver", "drivername", "driveremail", "email"]);
  const dateIndex = columnIndex(header, ["date", "servicedate"]);
  const customerIndex = columnIndex(header, ["customer", "customername", "location"]);
  const addressIndex = columnIndex(header, ["address"]);
  const cityIndex = columnIndex(header, ["city"]);
  const commodityIndex = columnIndex(header, ["commodity"]);
  const actionIndex = columnIndex(header, ["action"]);
  const notesIndex = columnIndex(header, ["dispatchnotes", "notes", "note"]);
  const stopIndex = columnIndex(header, ["stop", "sequence", "order"]);
  const runIndex = columnIndex(header, ["run"]);
  const dispatchIndex = columnIndex(header, ["ndispatch", "dispatch", "dispatchnumber", "dispatchno"]);
  const inOutIndex = columnIndex(header, ["inout"]);
  const destinationIndex = columnIndex(header, ["destination"]);
  const containerTypeIndex = columnIndex(header, ["containertype"]);
  const containerQtyIndex = columnIndex(header, ["containerqty", "qty", "quantity"]);
  const dispatchTypeIndex = columnIndex(header, ["dispatchtype", "type"]);
  const priorityIndex = columnIndex(header, ["priority"]);
  const dispatchedByIndex = columnIndex(header, ["dispatchedby"]);
  const pickupIndex = columnIndex(header, ["pickup", "pickupdescription", "description"]);

  if (driverIndex === -1 || dateIndex === -1 || customerIndex === -1) {
    throw new Error("The first row must include Driver, Date, and Customer columns.");
  }
  if (addressIndex === -1 && cityIndex === -1) {
    throw new Error("The first row must include Address or City.");
  }

  const headerLine = matrix.indexOf(headerRow) + 1;
  const rows: DispatchImportRow[] = [];
  const errors: { line: number; message: string }[] = [];

  for (const [offset, raw] of matrix.slice(headerLine).entries()) {
    const line = headerLine + offset + 1;
    if (!raw.some((value) => value.trim())) {
      continue;
    }
    const driverName = cell(raw, driverIndex);
    const driverEmail = driverName.includes("@") ? driverName.toLowerCase() : "";
    const serviceDate = normalizeServiceDate(cell(raw, dateIndex));
    const customerName = cell(raw, customerIndex);
    const address = cell(raw, addressIndex);
    const city = cell(raw, cityIndex);
    const commodity = cell(raw, commodityIndex);
    const action = cell(raw, actionIndex);
    const notes = cell(raw, notesIndex);
    const dispatchType = cell(raw, dispatchTypeIndex);
    const containerType = cell(raw, containerTypeIndex);
    const containerQty = cell(raw, containerQtyIndex);
    const pickup =
      cell(raw, pickupIndex) ||
      buildPickupDescription({ action, commodity, notes, dispatchType, containerType, containerQty });
    const fullAddress = formatDispatchAddress(address, city);
    const stop = parseWholeNumber(cell(raw, stopIndex));
    const run = parseWholeNumber(cell(raw, runIndex));

    if (!driverName || !serviceDate || !customerName) {
      errors.push({ line, message: "Enter a driver, date, and customer." });
      continue;
    }
    if (!fullAddress) {
      errors.push({ line, message: "Enter an address or city." });
      continue;
    }
    if (!pickup) {
      errors.push({ line, message: "Enter commodity, action, or pickup details." });
      continue;
    }

    rows.push({
      line,
      driverName,
      driverEmail,
      inOut: cell(raw, inOutIndex),
      dispatchNumber: cell(raw, dispatchIndex),
      run,
      stop,
      serviceDate,
      customerName,
      address,
      city,
      destination: cell(raw, destinationIndex),
      commodity,
      containerType,
      containerQty,
      action,
      notes,
      dispatchType,
      priority: cell(raw, priorityIndex),
      dispatchedBy: cell(raw, dispatchedByIndex),
      pickupDescription: pickup,
      sequence: stop ?? 0,
    });
  }

  const groups = new Map<string, DispatchImportRow[]>();
  for (const row of rows) {
    const key = `${normalizeDriverKey(row.driverName)}|${row.serviceDate}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => {
      const runDiff = (a.run ?? 9999) - (b.run ?? 9999);
      if (runDiff !== 0) {
        return runDiff;
      }
      const stopDiff = (a.stop ?? 9999) - (b.stop ?? 9999);
      if (stopDiff !== 0) {
        return stopDiff;
      }
      return a.line - b.line;
    });
    ordered.forEach((row, index) => {
      row.sequence = row.stop ?? index + 1;
    });
  }

  return { rows, errors };
}

export function parseDispatchCsv(csv: string): Omit<DispatchImportPreview, "drivers"> {
  return parseDispatchMatrix(parseCsv(csv).map((record) => record.cells.map((value) => value.trim())));
}

export function matchDriversToDispatch(
  rows: DispatchImportRow[],
  drivers: { id: string; name: string; email: string }[],
): DispatchDriverMatch[] {
  const byEmail = new Map(drivers.map((driver) => [driver.email.toLowerCase(), driver]));
  const byName = new Map(drivers.map((driver) => [normalizeDriverKey(driver.name), driver]));

  const names = new Map<string, DispatchImportRow[]>();
  for (const row of rows) {
    const key = `${normalizeDriverKey(row.driverName)}|${row.driverEmail}`;
    const group = names.get(key) ?? [];
    group.push(row);
    names.set(key, group);
  }

  return [...names.values()]
    .map((group) => {
      const sample = group[0];
      const emailHit = sample.driverEmail ? byEmail.get(sample.driverEmail) : undefined;
      const nameHit = byName.get(normalizeDriverKey(sample.driverName));
      const hit = emailHit ?? nameHit;
      return {
        driverName: sample.driverName,
        driverId: hit?.id ?? null,
        driverEmail: hit?.email ?? (sample.driverEmail || null),
        matchedBy: (emailHit ? "email" : hit ? "name" : "none") as DispatchDriverMatch["matchedBy"],
        stopCount: group.length,
      };
    })
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}

export function dispatchRowsToCsv(rows: Record<string, string>[]): string {
  const header = dispatchReportHeaders.map(csvEscape).join(",");
  const lines = rows.map((row) => dispatchReportHeaders.map((key) => csvEscape(row[key] ?? "")).join(","));
  return `\uFEFF${[header, ...lines].join("\n")}\n`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
