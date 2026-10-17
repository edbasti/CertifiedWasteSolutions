import { useEffect, useMemo, useState } from "react";
import type { AssignedRoute, AssignedStop, StopStatus } from "@cws/shared";
import { ApiError, listRoutes } from "./api";

const statusLabels: Record<StopStatus, string> = {
  not_started: "Not started",
  en_route: "En route",
  completed: "Completed",
};

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function statusClass(status: StopStatus) {
  if (status === "completed") {
    return "status complete";
  }
  if (status === "en_route") {
    return "status enroute";
  }
  return "status pending";
}

export function DashboardPanel({ onOpenRoutes }: { onOpenRoutes: () => void }) {
  const [date] = useState(localDate);
  const [routes, setRoutes] = useState<AssignedRoute[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listRoutes(date)
      .then((result) => {
        if (active) {
          setRoutes(result.routes);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load today's overview.");
        }
      });
    return () => {
      active = false;
    };
  }, [date]);

  const stops = useMemo(
    () =>
      routes.flatMap((route) =>
        route.stops.map((stop) => ({
          stop,
          driverName: route.driverName,
        })),
      ),
    [routes],
  );

  const completed = stops.filter((item) => item.stop.status === "completed").length;
  const enRoute = stops.filter((item) => item.stop.status === "en_route").length;
  const notStarted = stops.filter((item) => item.stop.status === "not_started").length;
  const withAttention = stops.filter(
    (item) => item.stop.notes.length > 0 || item.stop.photos.length > 0 || item.stop.status === "en_route",
  ).length;
  const percent = stops.length === 0 ? 0 : Math.round((completed / stops.length) * 1000) / 10;

  const recent = [...stops]
    .flatMap(({ stop, driverName }) => {
      const last = stop.history.at(-1);
      if (!last) {
        return [];
      }
      return [
        {
          id: last.id,
          driverName,
          customerName: stop.customerName,
          status: stop.status,
          at: last.changedAt,
          hasPhoto: stop.photos.length > 0,
        },
      ];
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h2>Today&apos;s overview</h2>
          <p className="lede">Here&apos;s how your routes are moving today.</p>
        </div>
        <button className="primary" type="button" onClick={onOpenRoutes}>
          Open routes
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stats">
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">Stops today</span>
            <span className="stat-icon green">⌁</span>
          </div>
          <strong>{stops.length}</strong>
          <small>Across {routes.length} driver routes</small>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">Completed</span>
            <span className="stat-icon green">✓</span>
          </div>
          <strong>{completed}</strong>
          <small>
            <b>{percent}%</b> of today&apos;s stops
          </small>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">In progress</span>
            <span className="stat-icon blue">↗</span>
          </div>
          <strong>{enRoute}</strong>
          <small>{notStarted} not started</small>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">Needs attention</span>
            <span className="stat-icon orange">!</span>
          </div>
          <strong>{withAttention}</strong>
          <small>Notes, photos, or active stops</small>
        </div>
      </div>

      <div className="grid-2">
        <div className="card table-card">
          <div className="card-heading">
            <h3>Live route activity</h3>
            <button className="action-link" type="button" onClick={onOpenRoutes}>
              View all routes →
            </button>
          </div>
          {stops.length === 0 ? <p className="empty-copy">No stops scheduled for today yet.</p> : null}
          {stops.length > 0 ? (
            <table className="route-table">
              <thead>
                <tr>
                  <th>Customer &amp; address</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stops.slice(0, 8).map(({ stop, driverName }) => (
                  <StopRow key={stop.id} stop={stop} driverName={driverName} />
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        <div className="card">
          <div className="card-heading">
            <h3>Daily completion</h3>
            <span className={percent >= 60 ? "status complete" : "status pending"}>
              {stops.length === 0 ? "Waiting" : percent >= 60 ? "On track" : "In progress"}
            </span>
          </div>
          <div className="progress-wrap">
            <div className="progress-row">
              <span>
                {completed} of {stops.length} stops
              </span>
              <b>{percent}%</b>
            </div>
            <div className="progress">
              <span style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
          </div>
          <div className="card-heading">
            <h3>Active drivers</h3>
          </div>
          {routes.length === 0 ? <p className="empty-copy">No drivers assigned today.</p> : null}
          {routes.map((route) => {
            const done = route.stops.filter((stop) => stop.status === "completed").length;
            const active = route.stops.some((stop) => stop.status === "en_route");
            const allDone = route.stops.length > 0 && done === route.stops.length;
            return (
              <div className="driver-row" key={route.id}>
                <div className="avatar">{initials(route.driverName)}</div>
                <div>
                  <strong>{route.driverName}</strong>
                  <small>
                    {done} completed · {route.stops.length - done} remaining
                  </small>
                </div>
                <span className={allDone ? "status complete" : active ? "status enroute" : "status pending"}>
                  {allDone ? "Complete" : active ? "En route" : "Not started"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-heading">
          <h3>Recent activity</h3>
        </div>
        <div className="feed">
          {recent.length === 0 ? <p className="empty-copy">Status updates will show here as drivers work.</p> : null}
          {recent.map((item) => (
            <div className="feed-item" key={item.id}>
              <div className={`feed-dot ${item.status === "en_route" ? "blue" : item.status === "completed" ? "" : "amber"}`} />
              <div>
                <p>
                  <b>{item.driverName}</b>{" "}
                  {item.status === "completed"
                    ? `completed ${item.customerName}`
                    : item.status === "en_route"
                      ? `is en route to ${item.customerName}`
                      : `updated ${item.customerName}`}
                </p>
                <small>
                  {new Date(item.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {item.hasPhoto ? " · Photo attached" : ""}
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StopRow({ stop, driverName }: { stop: AssignedStop; driverName: string }) {
  return (
    <tr>
      <td>
        <div className="customer">
          <div className="customer-mark">{initials(stop.customerName)}</div>
          <div className="customer-copy">
            <span className="customer-title">{stop.customerName}</span>
            <span className="subtext">{stop.address}</span>
          </div>
        </div>
      </td>
      <td>{driverName}</td>
      <td>
        <span className={statusClass(stop.status)}>{statusLabels[stop.status]}</span>
      </td>
    </tr>
  );
}
