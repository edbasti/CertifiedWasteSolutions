import type { RouteSource, StopSourceInfo } from "@cws/shared";
import { columnIndex, parseCsv } from "./csv";

export class StopSourceError extends Error {}

export type PlannedStop = {
  line: number;
  sequence: number;
  customerName: string;
  address: string;
  pickupDescription: string;
};

export type StopPlan = {
  driverEmail: string;
  serviceDate: string;
  stops: PlannedStop[];
};

export type StopSource = {
  id: RouteSource;
  label: string;
  available: boolean;
  detail?: string;
  plan: (input: string) => { plans: StopPlan[]; errors: { line: number; message: string }[] };
};

const netsuiteDetail = "NetSuite is not connected. Import a CSV or add stops by hand.";

export const stopSources: StopSourceInfo[] = [
  { id: "csv", label: "CSV file", available: true },
  { id: "manual", label: "By hand", available: true },
  { id: "netsuite", label: "NetSuite", available: false, detail: netsuiteDetail },
];

type CsvStopRow = {
  line: number;
  driverEmail: string;
  serviceDate: string;
  customerName: string;
  address: string;
  pickupDescription: string;
  sequence: number | null;
};

export function validServiceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function readStopCsv(csv: string): { rows: CsvStopRow[]; errors: { line: number; message: string }[] } {
  const records = parseCsv(csv);
  const header = records[0];
  if (!header) {
    throw new StopSourceError("The first row must include driverEmail, serviceDate, customer, and pickup.");
  }
  const driverIndex = columnIndex(header.cells, ["driveremail", "email", "driver"]);
  const dateIndex = columnIndex(header.cells, ["servicedate", "date"]);
  const customerIndex = columnIndex(header.cells, ["customer", "customername", "location"]);
  const pickupIndex = columnIndex(header.cells, ["pickup", "pickupdescription", "description"]);
  const addressIndex = columnIndex(header.cells, ["address"]);
  const sequenceIndex = columnIndex(header.cells, ["sequence", "stop", "order"]);
  if (driverIndex === -1 || dateIndex === -1 || customerIndex === -1 || pickupIndex === -1) {
    throw new StopSourceError("The first row must include driverEmail, serviceDate, customer, and pickup.");
  }

  const rows: CsvStopRow[] = [];
  const errors: { line: number; message: string }[] = [];
  for (const record of records.slice(1)) {
    const driverEmail = (record.cells[driverIndex] ?? "").trim().toLowerCase();
    const serviceDate = (record.cells[dateIndex] ?? "").trim();
    const customerName = (record.cells[customerIndex] ?? "").trim();
    const pickupDescription = (record.cells[pickupIndex] ?? "").trim();
    const address = addressIndex === -1 ? "" : (record.cells[addressIndex] ?? "").trim();
    const sequenceText = sequenceIndex === -1 ? "" : (record.cells[sequenceIndex] ?? "").trim();
    if (!driverEmail || !serviceDate || !customerName || !pickupDescription) {
      errors.push({ line: record.line, message: "Enter a driver email, date, customer, and pickup." });
      continue;
    }
    if (!driverEmail.includes("@")) {
      errors.push({ line: record.line, message: "Enter the driver's email." });
      continue;
    }
    if (!validServiceDate(serviceDate)) {
      errors.push({ line: record.line, message: "Use a service date like 2026-10-06." });
      continue;
    }
    let sequence: number | null = null;
    if (sequenceText) {
      sequence = Number(sequenceText);
      if (!Number.isInteger(sequence) || sequence < 1) {
        errors.push({ line: record.line, message: "Sequence must be a whole number starting at 1." });
        continue;
      }
    }
    rows.push({
      line: record.line,
      driverEmail,
      serviceDate,
      customerName,
      address,
      pickupDescription,
      sequence,
    });
  }
  return { rows, errors };
}

function groupPlans(rows: CsvStopRow[]): { plans: StopPlan[]; errors: { line: number; message: string }[] } {
  const groups = new Map<string, CsvStopRow[]>();
  for (const row of rows) {
    const key = `${row.driverEmail}|${row.serviceDate}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const plans: StopPlan[] = [];
  const errors: { line: number; message: string }[] = [];
  for (const group of groups.values()) {
    const sequenced = group.some((row) => row.sequence !== null);
    const missing = group.find((row) => row.sequence === null);
    if (sequenced && missing) {
      errors.push({
        line: missing.line,
        message: "Enter a sequence for every stop on that route, or leave sequence blank.",
      });
      continue;
    }

    const ordered = sequenced ? [...group].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)) : group;
    const seen = new Set<number>();
    let duplicate = false;
    for (const row of ordered) {
      if (row.sequence !== null && seen.has(row.sequence)) {
        errors.push({ line: row.line, message: "That sequence is used twice." });
        duplicate = true;
      }
      if (row.sequence !== null) {
        seen.add(row.sequence);
      }
    }
    if (duplicate) {
      continue;
    }

    plans.push({
      driverEmail: group[0].driverEmail,
      serviceDate: group[0].serviceDate,
      stops: ordered.map((row, index) => ({
        line: row.line,
        sequence: row.sequence ?? index + 1,
        customerName: row.customerName,
        address: row.address,
        pickupDescription: row.pickupDescription,
      })),
    });
  }
  return { plans, errors };
}

export const csvStopSource: StopSource = {
  id: "csv",
  label: "CSV file",
  available: true,
  plan(input: string) {
    const parsed = readStopCsv(input);
    const grouped = groupPlans(parsed.rows);
    return { plans: grouped.plans, errors: [...parsed.errors, ...grouped.errors] };
  },
};

export const netsuiteStopSource: StopSource = {
  id: "netsuite",
  label: "NetSuite",
  available: false,
  detail: netsuiteDetail,
  plan() {
    throw new StopSourceError(netsuiteDetail);
  },
};

export const manualStopSource: StopSource = {
  id: "manual",
  label: "By hand",
  available: true,
  plan() {
    return { plans: [], errors: [] };
  },
};
