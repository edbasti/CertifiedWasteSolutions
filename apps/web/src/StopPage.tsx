import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { serviceTypeLabels, stopStatuses, type DriverDay, type DriverStop, type StopStatus } from "@cws/shared";
import { addStopNote, ApiError, loadDay, setStopStatus, uploadStopPhotos } from "./api";
import { CameraCapture } from "./CameraCapture";
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

function nextIncomplete(stops: DriverStop[], afterId?: string) {
  const start = afterId ? stops.findIndex((stop) => stop.id === afterId) + 1 : 0;
  return stops.slice(start).find((stop) => stop.status !== "completed") ?? stops.find((stop) => stop.status !== "completed");
}

export function StopPage() {
  const { stopId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, logout } = useSession();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? (params.get("date") as string) : localDate();
  const [day, setDay] = useState<DriverDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;
    loadDay(date)
      .then((next) => {
        if (!active) {
          return;
        }
        setDay(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load this stop.");
        }
      });
    return () => {
      active = false;
    };
  }, [date, stopId]);

  const stop = day?.stops.find((item) => item.id === stopId) ?? null;

  async function run(action: () => Promise<DriverDay>) {
    if (busy) {
      return;
    }
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

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stop) {
      return;
    }
    await run(() => addStopNote(stop.id, note));
    setNote("");
  }

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    if (!stop) {
      return;
    }
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length > 0) {
      void run(() => uploadStopPhotos(stop.id, files));
    }
  }

  return (
    <div className="field-shell">
      <header className="field-topbar">
        <div>
          <p className="eyebrow">Driver</p>
          <h1>Stop details</h1>
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
            <p className="eyebrow">{date}</p>
            <h2>{stop ? stop.customerName : "Stop"}</h2>
            <p className="lede">Update status, photos, and notes for this stop.</p>
          </div>
          <Link className="secondary" to={`/day/stops?date=${date}`}>
            ← All stops
          </Link>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {!stop && !error ? <p className="lede">Loading stop…</p> : null}
        {!stop && error ? (
          <p className="lede">
            This stop is not on your route for {date}.{" "}
            <Link to={`/day/stops?date=${date}`}>Back to today&apos;s stops</Link>
          </p>
        ) : null}
        {stop ? (
          <section className="card day-focus stack">
            <button type="button" className="stop-address stop-address-detail" onClick={() => setMapOpen(true)}>
              {stop.address}
            </button>
            <p className="pickup">
              {serviceTypeLabels[stop.serviceType]} · Qty {stop.quantity}
            </p>
            {stop.driverNotes ? <p className="lede">Notes: {stop.driverNotes}</p> : null}
            {mapOpen ? (
              <Modal title="Location" onClose={() => setMapOpen(false)}>
                <p className="lede">{stop.customerName}</p>
                <p className="map-address">{stop.address}</p>
                <div className="row-actions">
                  <a className="primary" href={googleMapsUrl(stop.address)} target="_blank" rel="noreferrer">
                    Open in Google Maps
                  </a>
                  <button className="secondary" type="button" onClick={() => setMapOpen(false)}>
                    Cancel
                  </button>
                </div>
              </Modal>
            ) : null}
            <label htmlFor="stop-status">Status</label>
            <select
              id="stop-status"
              className="stop-status-select"
              value={stop.status}
              disabled={busy}
              onChange={(event) => {
                const nextStatus = event.target.value as StopStatus;
                void run(async () => {
                  const next = await setStopStatus(stop.id, nextStatus);
                  if (nextStatus === "completed") {
                    const following = nextIncomplete(next.stops, stop.id);
                    if (following) {
                      navigate(`/day/stop/${following.id}?date=${date}`);
                    } else {
                      navigate(`/day/stops?date=${date}`);
                    }
                  }
                  return next;
                });
              }}
            >
              {stopStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
            <button className="secondary status-button" type="button" onClick={() => setHistoryOpen((open) => !open)}>
              {historyOpen ? "Hide history" : "Status history"}
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
            <h3>Photo</h3>
            <div className="row-actions">
              <button className="secondary" type="button" disabled={busy} onClick={() => setCameraOpen(true)}>
                Camera
              </button>
              <label className="secondary file-button">
                Gallery
                <input type="file" accept="image/*" multiple onChange={choosePhotos} />
              </label>
            </div>
            {cameraOpen ? (
              <CameraCapture
                onClose={() => setCameraOpen(false)}
                onCapture={(file) => {
                  setCameraOpen(false);
                  void run(() => uploadStopPhotos(stop.id, [file]));
                }}
              />
            ) : null}
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
        ) : null}
      </main>
    </div>
  );
}
