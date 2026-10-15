import { useEffect, useState } from "react";
import type { CompletedStopReport, StopStatus } from "@cws/shared";
import { ApiError, loadStopReport } from "./api";

const statusLabels: Record<StopStatus, string> = {
  not_started: "Not started",
  en_route: "En route",
  completed: "Completed",
};

function queryString(filters: { driver: string; customer: string; from: string; to: string }): string {
  const params = new URLSearchParams();
  if (filters.driver.trim()) {
    params.set("driver", filters.driver.trim());
  }
  if (filters.customer.trim()) {
    params.set("customer", filters.customer.trim());
  }
  if (filters.from) {
    params.set("from", filters.from);
  }
  if (filters.to) {
    params.set("to", filters.to);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function minutesLabel(minutes: number): string {
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

export function ReportsPanel() {
  const [driver, setDriver] = useState("");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState({ driver: "", customer: "", from: "", to: "" });
  const [report, setReport] = useState<CompletedStopReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(filters: { driver: string; customer: string; from: string; to: string }) {
    setBusy(true);
    setError(null);
    try {
      const result = await loadStopReport(filters);
      setApplied(filters);
      setReport(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the report.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    loadStopReport({ driver: "", customer: "", from: "", to: "" })
      .then((result) => {
        if (active) {
          setReport(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load the report.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="card stack">
      <h2>Completed stops</h2>
      <p className="lede">
        Operational report of finished route stops (timing, notes, photos). For driver billing submissions, open Driver
        Logs.
      </p>
      <label htmlFor="report-driver">Driver</label>
      <input id="report-driver" value={driver} onChange={(event) => setDriver(event.target.value)} />
      <label htmlFor="report-customer">Customer</label>
      <input id="report-customer" value={customer} onChange={(event) => setCustomer(event.target.value)} />
      <label htmlFor="report-from">From</label>
      <input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      <label htmlFor="report-to">To</label>
      <input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      <div className="row-actions">
        <button className="primary" type="button" disabled={busy} onClick={() => void run({ driver, customer, from, to })}>
          Run report
        </button>
        <a className="secondary" href={`/api/reports/stops.csv${queryString(applied)}`}>
          Download CSV
        </a>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <>
          <h3>Average time between status changes</h3>
          {report.averages.length === 0 ? <p className="lede">No status timing for these stops.</p> : null}
          {report.averages.length > 0 ? (
            <div className="live-summary">
              {report.averages.map((average) => (
                <div key={`${average.fromStatus}-${average.toStatus}`}>
                  <b>{minutesLabel(average.averageMinutes)}</b>
                  <span>
                    {statusLabels[average.fromStatus]} to {statusLabels[average.toStatus]} · {average.samples}{" "}
                    {average.samples === 1 ? "stop" : "stops"}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {report.stops.length === 0 ? <p className="lede">No completed stops match that report.</p> : null}
          <ul className="driver-list">
            {report.stops.map((stop) => (
              <li key={stop.id}>
                <div>
                  <strong>
                    {stop.sequence}. {stop.customerName}
                  </strong>
                  <span>
                    {stop.driverName} · {stop.serviceDate}
                  </span>
                  <span>{stop.pickupDescription}</span>
                  <h3>Notes</h3>
                  {stop.notes.length === 0 ? <p className="lede">No notes.</p> : null}
                  <div className="activity-notes">
                    {stop.notes.map((note) => (
                      <p key={note.id}>
                        {note.body}
                        {note.authorName ? <span className="lede"> · {note.authorName}</span> : null}
                      </p>
                    ))}
                  </div>
                  <h3>Photos</h3>
                  {stop.photos.length === 0 ? <p className="lede">No photos.</p> : null}
                  {stop.photos.length > 0 ? (
                    <div className="activity-photos">
                      {stop.photos.map((photo) => (
                        <img key={photo.id} src={`/api/photos/${photo.id}`} alt="" />
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
