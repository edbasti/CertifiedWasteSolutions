import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  serviceTypeLabels,
  type AppNotification,
  type DriverDay,
  type DriverDaySummary,
  type DriverStop,
  type StopStatus,
} from "@cws/shared";
import { ApiError, listDriverDays, listNotifications, loadDay, markNotificationRead, reorderDay } from "./api";
import { googleMapsUrl } from "./maps";
import { Modal } from "./Modal";
import { useSession } from "./session";
import "./day.css";

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

function formatDay(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function nextIncomplete(stops: DriverStop[]) {
  return stops.find((stop) => stop.status !== "completed");
}

function FieldShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { user, logout } = useSession();
  return (
    <div className="field-shell">
      <header className="field-topbar">
        <div>
          <p className="eyebrow">Driver</p>
          <h1>{title}</h1>
        </div>
        <div className="top-actions">
          <span>
            {user?.name} · {user?.role}
          </span>
          <button className="secondary" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content day">{children}</main>
    </div>
  );
}

function CompactNotices() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    let active = true;
    listNotifications()
      .then((result) => {
        if (active) {
          setItems(result.notifications);
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="notices compact" aria-label="Route updates">
      <h2>New route updates</h2>
      <ul className="notice-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!item.readAt) {
                    try {
                      await markNotificationRead(item.id);
                    } catch {
                      return;
                    }
                  }
                  if (item.serviceDate) {
                    navigate(`/day/stops?date=${item.serviceDate}`);
                  }
                })();
              }}
            >
              {item.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StopCard({
  stop,
  date,
  index,
  total,
  busy,
  onReorder,
}: {
  stop: DriverStop;
  date: string;
  index: number;
  total: number;
  busy: boolean;
  onReorder: (direction: "up" | "down") => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const stopPath = `/day/stop/${encodeURIComponent(stop.id)}?date=${date}`;
  const mapsHref = googleMapsUrl(stop.address);

  return (
    <article className="stop-card">
      <div className="stop-row">
        <Link className="stop-open" to={stopPath}>
          <span className="stop-number">{stop.sequence}</span>
          <span className="stop-copy">
            <span className="stop-title">{stop.customerName}</span>
            <span className="stop-meta">
              {serviceTypeLabels[stop.serviceType]} · Qty {stop.quantity}
              {stop.driverNotes ? ` · ${stop.driverNotes}` : ""}
            </span>
          </span>
          <span
            className={
              stop.status === "completed"
                ? "status complete"
                : stop.status === "en_route"
                  ? "status enroute"
                  : "status pending"
            }
          >
            {statusLabels[stop.status]}
          </span>
        </Link>
        <button
          type="button"
          className="stop-map-btn"
          onClick={() => setMapOpen(true)}
          aria-label={`Open map for ${stop.address}`}
          title={stop.address}
        >
          Map
        </button>
        {stop.status === "not_started" ? (
          <div className="stop-reorder">
            <button
              className="secondary stop-reorder-btn"
              type="button"
              disabled={busy || index === 0}
              onClick={() => onReorder("up")}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              className="secondary stop-reorder-btn"
              type="button"
              disabled={busy || index === total - 1}
              onClick={() => onReorder("down")}
              aria-label="Move down"
            >
              ↓
            </button>
          </div>
        ) : null}
      </div>
      {mapOpen ? (
        <Modal title="Location" onClose={() => setMapOpen(false)}>
          <p className="lede">{stop.customerName}</p>
          <p className="map-address">{stop.address}</p>
          <div className="row-actions">
            <a className="primary" href={mapsHref} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
            <button className="secondary" type="button" onClick={() => setMapOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
    </article>
  );
}

/** Driver home: active route days only. */
export function DayPage() {
  const { user } = useSession();
  const [days, setDays] = useState<DriverDaySummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listDriverDays()
      .then((result) => {
        if (active) {
          setDays(result.days);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load your route days.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const activeDays = days.filter((day) => !day.completed);
  const archivedCount = days.filter((day) => day.completed).length;

  return (
    <FieldShell title="My route days">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Driver</p>
          <h2>Good morning, {user?.name?.split(" ")[0] ?? "driver"}</h2>
          <p className="lede">Open a day to work its stops. Completed days move to Archived.</p>
        </div>
        <Link className="secondary" to="/day/archived">
          Archived ({archivedCount}) →
        </Link>
      </div>
      <CompactNotices />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {activeDays.length === 0 ? (
        <p className="lede">
          No open route days.{" "}
          {archivedCount > 0 ? <Link to="/day/archived">View archived days</Link> : "Check back when the office assigns stops."}
        </p>
      ) : (
        <div className="day-list">
          {activeDays.map((day) => (
            <Link key={day.routeId} className="day-card" to={`/day/stops?date=${day.serviceDate}`}>
              <div className="day-card-copy">
                <strong>{formatDay(day.serviceDate)}</strong>
                <span className="subtext">
                  {day.completedCount}/{day.stopCount} complete
                </span>
              </div>
              <span className="status pending">Open</span>
            </Link>
          ))}
        </div>
      )}
      <div className="day-log-footer">
        <p>When a day is finished, fill the Independent Driver Log for that date.</p>
        <Link className="primary" to={`/log?date=${localDate()}`}>
          Independent Driver Log →
        </Link>
      </div>
    </FieldShell>
  );
}

export function ArchivedDaysPage() {
  const [days, setDays] = useState<DriverDaySummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listDriverDays()
      .then((result) => {
        if (active) {
          setDays(result.days.filter((day) => day.completed));
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load archived days.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <FieldShell title="Archived days">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Completed</p>
          <h2>Archived route days</h2>
          <p className="lede">Days where every stop is marked completed.</p>
        </div>
        <Link className="secondary" to="/day">
          ← Open days
        </Link>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {days.length === 0 ? (
        <p className="lede">No archived days yet.</p>
      ) : (
        <div className="day-list">
          {days.map((day) => (
            <Link key={day.routeId} className="day-card" to={`/day/stops?date=${day.serviceDate}`}>
              <div className="day-card-copy">
                <strong>{formatDay(day.serviceDate)}</strong>
                <span className="subtext">
                  {day.stopCount} {day.stopCount === 1 ? "stop" : "stops"}
                </span>
              </div>
              <span className="status complete">Completed</span>
            </Link>
          ))}
        </div>
      )}
    </FieldShell>
  );
}

/** Compact stop list for one service date — click always opens stop detail. */
export function DayStopsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryDate = params.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : localDate();
  const [day, setDay] = useState<DriverDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadDay(date)
      .then((next) => {
        if (active) {
          setDay(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load today's stops.");
        }
      });
    return () => {
      active = false;
    };
  }, [date]);

  const stops = day?.stops ?? [];
  const completed = stops.filter((stop) => stop.status === "completed").length;
  const dayComplete = stops.length > 0 && completed === stops.length;
  const listStops = dayComplete ? stops : stops.filter((stop) => stop.status !== "completed");
  const hiddenCompleted = dayComplete ? 0 : completed;

  async function run(action: () => Promise<DriverDay>) {
    setBusy(true);
    setError(null);
    try {
      setDay(await action());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the stop.");
    } finally {
      setBusy(false);
    }
  }

  function reorderInList(list: DriverStop[], index: number, direction: "up" | "down") {
    const ids = stops.map((item) => item.id);
    const stopId = list[index]?.id;
    const fullIndex = ids.indexOf(stopId ?? "");
    if (fullIndex < 0) {
      return;
    }
    const swapWith = direction === "up" ? fullIndex - 1 : fullIndex + 1;
    if (swapWith < 0 || swapWith >= ids.length) {
      return;
    }
    [ids[fullIndex], ids[swapWith]] = [ids[swapWith], ids[fullIndex]];
    void run(() => reorderDay(date, ids));
  }

  return (
    <FieldShell title="Stops">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{formatDay(date)}</p>
          <h2>{dayComplete ? "Completed day" : "Today's stops"}</h2>
          <p className="lede">Tap a stop to open its detail page.</p>
        </div>
        <Link className="secondary" to={dayComplete ? "/day/archived" : "/day"}>
          ← {dayComplete ? "Archived days" : "My route days"}
        </Link>
      </div>
      <div className="driver-progress card">
        <div className="progress-row">
          <span>
            <b>
              {completed} of {stops.length}
            </b>{" "}
            complete
          </span>
          <b>{stops.length === 0 ? "0%" : `${Math.round((completed / stops.length) * 100)}%`}</b>
        </div>
        <div className="progress">
          <span style={{ width: `${stops.length === 0 ? 0 : Math.round((completed / stops.length) * 100)}%` }} />
        </div>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {dayComplete ? (
        <section className="card stack day-log-cta">
          <h2>All stops are complete</h2>
          <p className="lede">This day is archived. Next: Independent Driver Log, then the office can invoice.</p>
          <Link className="primary" to={`/log?date=${date}`}>
            Open Independent Driver Log →
          </Link>
        </section>
      ) : null}
      {listStops.length === 0 && !dayComplete ? (
        <p className="lede">No stops assigned for this date.</p>
      ) : (
        <div className="stop-list">
          {listStops.map((stop, index) => (
            <StopCard
              key={stop.id}
              stop={stop}
              date={date}
              index={index}
              total={listStops.length}
              busy={busy}
              onReorder={(direction) => reorderInList(listStops, index, direction)}
            />
          ))}
        </div>
      )}
      {hiddenCompleted > 0 ? (
        <p className="lede">
          {hiddenCompleted} completed {hiddenCompleted === 1 ? "stop is" : "stops are"} hidden. Finish the rest, then
          this day moves to Archived.
        </p>
      ) : null}
      {!dayComplete && listStops.length > 0 ? (
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() => {
            const stop = nextIncomplete(listStops);
            if (stop) {
              navigate(`/day/stop/${stop.id}?date=${date}`);
            }
          }}
        >
          Get started
        </button>
      ) : null}
    </FieldShell>
  );
}
