import { useEffect, useState } from "react";
import type { NetSuiteConnection } from "@cws/shared";
import { ApiError, loadNetSuite } from "./api";

export function NetSuitePanel() {
  const [connection, setConnection] = useState<NetSuiteConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadNetSuite()
      .then((result) => {
        if (active) {
          setConnection(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load the NetSuite connection.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="card stack">
      <h2>NetSuite</h2>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {connection ? (
        <>
          <p className="badge">{connection.message}</p>
          <p className="lede">Stops still come from a CSV file or are added by hand.</p>
          <h3>Credentials</h3>
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
          <h3>Saved search</h3>
          <p className="lede">{connection.savedSearch.id ? connection.savedSearch.id : "No saved search is selected."}</p>
          <ul className="history">
            {connection.savedSearch.columns.map((column) => (
              <li key={column.field}>
                {column.label} → {column.column}
                {column.required ? "" : " (optional)"}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
