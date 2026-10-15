import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type {
  DispatchDriverMatch,
  DispatchImportPreview,
  DispatchImportRow,
  NetSuiteConnection,
  RouteImportResult,
} from "@cws/shared";
import {
  ApiError,
  exportNetSuiteDispatchUrl,
  importNetSuiteDispatch,
  listRouteDrivers,
  loadNetSuite,
  previewNetSuiteDispatch,
} from "./api";

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function importNotice(result: RouteImportResult): string {
  const summary = `Imported ${result.stops} stops across ${result.createdRoutes + result.replacedRoutes} routes (${result.createdRoutes} new, ${result.replacedRoutes} replaced).`;
  if (result.errors.length === 0) {
    return summary;
  }
  return `${summary} ${result.errors.map((error) => `Row ${error.line}: ${error.message}`).join(" ")}`;
}

export function NetSuitePanel() {
  const [connection, setConnection] = useState<NetSuiteConnection | null>(null);
  const [drivers, setDrivers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [preview, setPreview] = useState<DispatchImportPreview | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(localDate);
  const [to, setTo] = useState(localDate);

  useEffect(() => {
    let active = true;
    Promise.all([loadNetSuite(), listRouteDrivers()])
      .then(([netsuite, driverResult]) => {
        if (!active) {
          return;
        }
        setConnection(netsuite);
        setDrivers(driverResult.drivers);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load the NetSuite tools.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const unmatched = useMemo(
    () => (preview?.drivers ?? []).filter((driver) => !driver.driverId && !assignments[driver.driverName]),
    [preview, assignments],
  );

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await previewNetSuiteDispatch(file);
      setPreview(next);
      const initial: Record<string, string> = {};
      for (const driver of next.drivers) {
        if (driver.driverId) {
          initial[driver.driverName] = driver.driverId;
        }
      }
      setAssignments(initial);
      setNotice(
        next.rows.length === 0
          ? "No usable dispatch rows were found."
          : `Ready to review ${next.rows.length} dispatch rows from ${file.name}.`,
      );
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof ApiError ? caught.message : "Could not read that dispatch file.");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!preview) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importNetSuiteDispatch(preview.rows, assignments);
      setNotice(importNotice(result));
      if (result.stops > 0) {
        setPreview(null);
        setAssignments({});
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not import the dispatch file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card stack">
        <h2>NetSuite dispatch files</h2>
        <p className="lede">
          Export a Dispatch Truck Report from NetSuite, import the .xlsx or .csv here, assign any unmatched drivers, then
          create portal routes. You can also export current portal stops back in the same column layout.
        </p>
        {connection ? <p className="badge">{connection.message}</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="notice">{notice}</p> : null}
      </section>

      <section className="card stack">
        <h2>Import Dispatch Truck Report</h2>
        <p className="lede">
          Expected columns include Driver, Date, Customer, Address/City, Commodity, Action, Stop, and Dispatch notes —
          matching the NetSuite report layout.
        </p>
        <label htmlFor="netsuite-file">Excel or CSV file</label>
        <input
          id="netsuite-file"
          type="file"
          accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(event) => void onFile(event)}
        />
      </section>

      {preview ? (
        <section className="card stack">
          <h2>Assign drivers</h2>
          <p className="lede">
            Names from NetSuite are matched to portal drivers when possible. Assign any remaining names before importing.
          </p>
          {unmatched.length > 0 ? (
            <p className="form-error" role="alert">
              {unmatched.length} driver name{unmatched.length === 1 ? "" : "s"} still need an assignment.
            </p>
          ) : (
            <p className="notice">All NetSuite driver names are assigned.</p>
          )}
          <ul className="driver-list">
            {preview.drivers.map((driver) => (
              <DriverAssignRow
                key={driver.driverName}
                driver={driver}
                drivers={drivers}
                value={assignments[driver.driverName] ?? ""}
                onChange={(driverId) =>
                  setAssignments((current) => ({
                    ...current,
                    [driver.driverName]: driverId,
                  }))
                }
              />
            ))}
          </ul>
          <div className="row-actions">
            <button className="primary" type="button" disabled={busy || unmatched.length > 0} onClick={() => void onImport()}>
              {busy ? "Importing…" : "Import and assign routes"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setAssignments({});
              }}
            >
              Cancel
            </button>
          </div>
          <DispatchPreviewTable rows={preview.rows} />
          {preview.errors.length > 0 ? (
            <ul className="history">
              {preview.errors.map((item) => (
                <li key={`${item.line}-${item.message}`}>
                  Row {item.line}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="card stack">
        <h2>Export Dispatch Truck Report</h2>
        <p className="lede">Download portal stops in the NetSuite column layout for the selected date range.</p>
        <label htmlFor="export-from">From</label>
        <input id="export-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <label htmlFor="export-to">To</label>
        <input id="export-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <div className="row-actions">
          <a className="secondary" href={exportNetSuiteDispatchUrl(from, to, "xlsx")}>
            Download Excel
          </a>
          <a className="secondary" href={exportNetSuiteDispatchUrl(from, to, "csv")}>
            Download CSV
          </a>
        </div>
      </section>

      {connection ? (
        <section className="card stack">
          <h2>Connection notes</h2>
          <p className="lede">
            Live NetSuite API pull is not required for this workflow. Credential slots below are optional for a future
            direct connection.
          </p>
          <ul className="driver-list">
            {connection.credentials.map((slot) => (
              <li key={slot.key}>
                <div>
                  <strong>{slot.label}</strong>
                  <span>{slot.configured ? "Set" : "Not set"}</span>
                </div>
              </li>
            ))}
          </ul>
          <h3>Report columns</h3>
          <ul className="history">
            {connection.dispatchColumns.map((column) => (
              <li key={column}>{column}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function DriverAssignRow({
  driver,
  drivers,
  value,
  onChange,
}: {
  driver: DispatchDriverMatch;
  drivers: { id: string; name: string; email: string }[];
  value: string;
  onChange: (driverId: string) => void;
}) {
  return (
    <li>
      <div>
        <strong>{driver.driverName}</strong>
        <span>
          {driver.stopCount} stop{driver.stopCount === 1 ? "" : "s"}
          {driver.matchedBy === "none" ? " · needs assignment" : ` · matched by ${driver.matchedBy}`}
        </span>
      </div>
      <label className="sr-only" htmlFor={`assign-${driver.driverName}`}>
        Assign portal driver for {driver.driverName}
      </label>
      <select
        id={`assign-${driver.driverName}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose portal driver…</option>
        {drivers.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.email}
          </option>
        ))}
      </select>
    </li>
  );
}

function DispatchPreviewTable({ rows }: { rows: DispatchImportRow[] }) {
  const sample = rows.slice(0, 12);
  return (
    <div className="table-card card" style={{ padding: 0, marginTop: 8 }}>
      <div className="card-heading">
        <h3>Preview</h3>
        <span className="subtext">
          Showing {sample.length} of {rows.length}
        </span>
      </div>
      <table className="route-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Driver</th>
            <th>Customer</th>
            <th>Pickup</th>
          </tr>
        </thead>
        <tbody>
          {sample.map((row) => (
            <tr key={`${row.line}-${row.dispatchNumber}-${row.sequence}`}>
              <td>{row.serviceDate}</td>
              <td>{row.driverName}</td>
              <td>
                <div className="customer">
                  <div>
                    {row.customerName}
                    <span className="address">{[row.address, row.city].filter(Boolean).join(", ")}</span>
                  </div>
                </div>
              </td>
              <td>{row.pickupDescription}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
