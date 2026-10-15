import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { type AppNotification, type DriverDay, type DriverStop, type StopStatus } from "@cws/shared";
import {
  addStopNote,
  ApiError,
  listNotifications,
  loadDay,
  markNotificationRead,
  reorderDay,
  setStopStatus,
  uploadStopPhotos,
} from "./api";
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

function nextIncomplete(stops: DriverStop[], afterId?: string) {
  const start = afterId ? stops.findIndex((stop) => stop.id === afterId) + 1 : 0;
  return stops.slice(start).find((stop) => stop.status !== "completed") ?? stops.find((stop) => stop.status !== "completed");
}

function RouteNotices({ onOpen }: { onOpen: (serviceDate: string) => void }) {
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

  async function open(item: AppNotification) {
    if (!item.readAt) {
      try {
        const result = await markNotificationRead(item.id);
        setItems((current) => current.map((notice) => (notice.id === item.id ? result.notification : notice)));
      } catch {
        return;
      }
    }
    if (item.serviceDate) {
      onOpen(item.serviceDate);
    }
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="notices" aria-label="Route updates">
      <h2>Route updates</h2>
      {items.map((item) => (
        <button key={item.id} type="button" data-unread={item.readAt ? "false" : "true"} onClick={() => void open(item)}>
          {item.readAt ? null : <small>New</small>}
          {item.message}
        </button>
      ))}
    </section>
  );
}

export function DayPage() {
  const { user, logout } = useSession();
  const [params] = useSearchParams();
  const queryDate = params.get("date") ?? "";
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : localDate);
  const [day, setDay] = useState<DriverDay | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
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
  const focused = stops.find((stop) => stop.id === focusId) ?? null;
  const completed = stops.filter((stop) => stop.status === "completed").length;

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

  async function getStarted() {
    const stop = nextIncomplete(stops);
    if (!stop) {
      return;
    }
    if (stop.status === "not_started") {
      await run(() => setStopStatus(stop.id, "en_route"));
    }
    setFocusId(stop.id);
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
            <p className="lede">Finish your stops, then fill the Independent Driver Log for billing.</p>
          </div>
          <Link className="secondary" to={`/log?date=${date}`}>
            Independent Driver Log →
          </Link>
        </div>
        <RouteNotices
          onOpen={(serviceDate) => {
            setFocusId(null);
            setDate(serviceDate);
          }}
        />
        <label htmlFor="day-date">Service date</label>
        <input
          id="day-date"
          type="date"
          value={date}
          onChange={(event) => {
            setFocusId(null);
            setDate(event.target.value);
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
        {focused ? (
          <FocusedStop
            stop={focused}
            busy={busy}
            onBack={() => setFocusId(null)}
            onStart={() => void run(() => setStopStatus(focused.id, "en_route"))}
            onComplete={() =>
              void run(async () => {
                const next = await setStopStatus(focused.id, "completed");
                const following = nextIncomplete(next.stops, focused.id);
                setFocusId(following?.id ?? null);
                return next;
              })
            }
            onNote={(body) => run(() => addStopNote(focused.id, body))}
            onPhotos={(files) => run(() => uploadStopPhotos(focused.id, files))}
          />
        ) : (
          <>
            {stops.some((stop) => stop.status !== "completed") ? (
              <button className="primary" type="button" disabled={busy} onClick={() => void getStarted()}>
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
            <div className="stop-list">
              {stops.map((stop, index) => (
                <article className="stop-card" key={stop.id}>
                  <button className="stop-open" type="button" onClick={() => setFocusId(stop.id)}>
                    <div className="stop-top">
                      <div className="stop-number">{stop.sequence}</div>
                      <div>
                        <h3>{stop.customerName}</h3>
                        <span className="address">{stop.address}</span>
                        <span className="address">{stop.pickupDescription}</span>
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
                    </div>
                  </button>
                  <div className="stop-bottom">
                    <div className="row-actions">
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() => {
                          const ids = stops.map((item) => item.id);
                          [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                          void run(() => reorderDay(date, ids));
                        }}
                      >
                        Move up
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy || index === stops.length - 1}
                        onClick={() => {
                          const ids = stops.map((item) => item.id);
                          [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                          void run(() => reorderDay(date, ids));
                        }}
                      >
                        Move down
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
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

function FocusedStop({
  stop,
  busy,
  onBack,
  onStart,
  onComplete,
  onNote,
  onPhotos,
}: {
  stop: DriverStop;
  busy: boolean;
  onBack: () => void;
  onStart: () => void;
  onComplete: () => void;
  onNote: (body: string) => Promise<void>;
  onPhotos: (files: File[]) => Promise<void>;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [note, setNote] = useState("");

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onNote(note);
    setNote("");
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length > 0) {
      void onPhotos(files);
    }
  }

  return (
    <section className="card day-focus">
      <button className="secondary" type="button" onClick={onBack}>
        All stops
      </button>
      <h2>
        {stop.sequence}. {stop.customerName}
      </h2>
      <p className="lede">{stop.address}</p>
      <p className="pickup">Pickup: {stop.pickupDescription}</p>
      <button className="secondary status-button" type="button" onClick={() => setHistoryOpen((open) => !open)}>
        {statusLabels[stop.status]}
      </button>
      {historyOpen ? (
        <ul className="history">
          {stop.history.length === 0 ? <li>No status changes yet.</li> : null}
          {stop.history.map((change) => (
            <li key={change.id}>
              {change.fromStatus ? statusLabels[change.fromStatus] : "Assigned"} → {statusLabels[change.toStatus]} ·{" "}
              {new Date(change.changedAt).toLocaleString()}
            </li>
          ))}
        </ul>
      ) : null}
      {stop.status === "not_started" ? (
        <button className="primary" type="button" disabled={busy} onClick={onStart}>
          Get started
        </button>
      ) : null}
      {stop.status === "en_route" ? (
        <button className="primary" type="button" disabled={busy} onClick={onComplete}>
          Complete
        </button>
      ) : null}
      <h3>Photo</h3>
      <div className="row-actions">
        <label className="secondary file-button">
          Camera
          <input type="file" accept="image/*" capture="environment" onChange={choosePhotos} />
        </label>
        <label className="secondary file-button">
          Gallery
          <input type="file" accept="image/*" multiple onChange={choosePhotos} />
        </label>
      </div>
      {stop.photos.length > 0 ? (
        <div className="photo-row">
          {stop.photos.map((photo) => (
            <img key={photo.id} src={`/api/photos/${photo.id}`} alt="" />
          ))}
        </div>
      ) : (
        <p className="lede">No photos yet.</p>
      )}
      <h3>Notes</h3>
      <div className="note-list">
        {stop.notes.map((item) => (
          <p key={item.id}>{item.body}</p>
        ))}
      </div>
      <form className="stack" onSubmit={(event) => void saveNote(event)}>
        <label htmlFor="stop-note">Add a note</label>
        <textarea id="stop-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        <button className="primary" type="submit" disabled={busy || note.trim() === ""}>
          Save note
        </button>
      </form>
    </section>
  );
}
