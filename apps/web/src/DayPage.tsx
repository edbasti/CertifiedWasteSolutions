import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { type AppNotification, type DriverDay, type DriverStop, type StopStatus } from "@cws/shared";
import { ApiError, listNotifications, loadDay, markNotificationRead, reorderDay } from "./api";
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

function nextIncomplete(stops: DriverStop[]) {
  return stops.find((stop) => stop.status !== "completed");
}

function RouteNotices() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

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

  async function open(item: AppNotification) {
    if (openingId) {
      return;
    }
    setOpeningId(item.id);
    try {
      if (!item.readAt) {
        try {
          const result = await markNotificationRead(item.id);
          setItems((current) => current.map((notice) => (notice.id === item.id ? result.notification : notice)));
        } catch {
          return;
        }
      }
      const serviceDate = item.serviceDate;
      if (!serviceDate) {
        return;
      }
      const day = await loadDay(serviceDate);
      const first = nextIncomplete(day.stops) ?? day.stops[0];
      if (first) {
        navigate(`/day/stop/${first.id}?date=${serviceDate}`);
      } else {
        navigate(`/day?date=${serviceDate}`);
      }
    } catch {
      if (item.serviceDate) {
        navigate(`/day?date=${item.serviceDate}`);
      }
    } finally {
      setOpeningId(null);
    }
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="notices" aria-label="Route updates">
      <h2>Route updates</h2>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-unread={item.readAt ? "false" : "true"}
          disabled={openingId === item.id}
          onClick={() => void open(item)}
        >
          {item.readAt ? null : <small>New</small>}
          {item.message}
        </button>
      ))}
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
      <div className="stop-top">
        <Link className="stop-open" to={stopPath}>
          <div className="stop-number">{stop.sequence}</div>
          <div className="stop-copy">
            <h3>{stop.customerName}</h3>
            <span className="pickup-line">{stop.pickupDescription}</span>
          </div>
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
          className="stop-address"
          onClick={() => setMapOpen(true)}
          aria-label={`Open map for ${stop.address}`}
        >
          {stop.address}
        </button>
        {stop.status === "not_started" ? (
          <div className="stop-reorder">
            <button
              className="secondary stop-reorder-btn"
              type="button"
              disabled={busy || index === 0}
              onClick={() => onReorder("up")}
            >
              Up
            </button>
            <button
              className="secondary stop-reorder-btn"
              type="button"
              disabled={busy || index === total - 1}
              onClick={() => onReorder("down")}
            >
              Down
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

export function DayPage() {
  const { user, logout } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const queryDate = params.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : localDate();
  const [day, setDay] = useState<DriverDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      setParams({ date }, { replace: true });
    }
  }, [date, queryDate, setParams]);

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
  const activeStops = stops.filter((stop) => stop.status !== "completed");
  const archivedStops = stops.filter((stop) => stop.status === "completed");

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

  function getStarted() {
    const stop = nextIncomplete(activeStops);
    if (!stop) {
      return;
    }
    navigate(`/day/stop/${stop.id}?date=${date}`);
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
    <div className="field-shell">
      <header className="field-topbar">
        <div>
          <p className="eyebrow">Driver</p>
          <h1>Today&apos;s stops</h1>
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
      <main className="content day">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Route day</p>
            <h2>Good morning, {user?.name?.split(" ")[0] ?? "driver"}</h2>
            <p className="lede">Open a stop to work it. Completed stops move to Archived.</p>
          </div>
          <Link className="secondary" to={`/log?date=${date}`}>
            Independent Driver Log →
          </Link>
        </div>
        <RouteNotices />
        <label htmlFor="day-date">Service date</label>
        <input
          id="day-date"
          type="date"
          value={date}
          onChange={(event) => {
            setParams({ date: event.target.value });
          }}
        />
        <div className="driver-progress card">
          <div className="progress-row">
            <span>
              <b>
                {completed} of {stops.length}
              </b>{" "}
              {stops.length === 1 ? "stop" : "stops"} complete
            </span>
            <b>{stops.length === 0 ? "0%" : `${Math.round((completed / stops.length) * 100)}%`}</b>
          </div>
          <div className="progress">
            <span
              style={{
                width: `${stops.length === 0 ? 0 : Math.round((completed / stops.length) * 100)}%`,
              }}
            />
          </div>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {stops.length === 0 ? <p className="lede">No stops are assigned for this date.</p> : null}
        {activeStops.length > 0 ? (
          <button className="primary" type="button" disabled={busy} onClick={getStarted}>
            Get started
          </button>
        ) : null}
        {stops.length > 0 && completed === stops.length ? (
          <section className="card stack day-log-cta">
            <h2>All stops are complete</h2>
            <p className="lede">
              Next step: fill your <strong>Independent Driver Log</strong> (port or non-port) with ticket lines, then
              submit it so the office can invoice.
            </p>
            <Link className="primary" to={`/log?date=${date}`}>
              Open Independent Driver Log →
            </Link>
          </section>
        ) : null}

        <section className="stop-section">
          <h2>Up next</h2>
          {activeStops.length === 0 ? (
            <p className="lede">
              {stops.length === 0
                ? "Nothing scheduled."
                : completed > 0
                  ? "No open stops left. Check Archived below, or open the Independent Driver Log."
                  : "No open stops."}
            </p>
          ) : (
            <div className="stop-list">
              {activeStops.map((stop, index) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  date={date}
                  index={index}
                  total={activeStops.length}
                  busy={busy}
                  onReorder={(direction) => reorderInList(activeStops, index, direction)}
                />
              ))}
            </div>
          )}
        </section>

        {archivedStops.length > 0 ? (
          <section className="stop-section archived">
            <h2>Archived</h2>
            <p className="lede">Completed stops. Tap one to open it again.</p>
            <div className="stop-list">
              {archivedStops.map((stop, index) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  date={date}
                  index={index}
                  total={archivedStops.length}
                  busy={busy}
                  onReorder={(direction) => reorderInList(archivedStops, index, direction)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div className="day-log-footer">
          <p>When the route is done, submit your Independent Driver Log for this date.</p>
          <Link className="primary" to={`/log?date=${date}`}>
            Independent Driver Log →
          </Link>
        </div>
      </main>
    </div>
  );
}
