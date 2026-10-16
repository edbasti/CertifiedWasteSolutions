import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { AssignedRoute, AssignedStop, CustomerAccount, RouteImportResult, StopSourceInfo, StopStatus } from "@cws/shared";
import {
  addRouteStop,
  ApiError,
  importRoutes,
  listCustomers,
  listRouteDrivers,
  listRouteSources,
  listRoutes,
  removeStop,
  reorderRoute,
} from "./api";
import { Modal } from "./Modal";

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

export function RoutesPanel() {
  const [date, setDate] = useState(localDate);
  const [routes, setRoutes] = useState<AssignedRoute[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [sources, setSources] = useState<StopSourceInfo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingStop, setAddingStop] = useState(false);

  async function refresh(nextDate = date) {
    const result = await listRoutes(nextDate);
    setRoutes(result.routes);
  }

  useEffect(() => {
    let active = true;
    Promise.all([listRouteDrivers(), listCustomers(), listRouteSources(), listRoutes(date)])
      .then(([driverResult, customerResult, sourceResult, routeResult]) => {
        if (!active) {
          return;
        }
        setDrivers(driverResult.drivers);
        setCustomers(customerResult.customers.filter((customer) => customer.active));
        setSources(sourceResult.sources);
        setRoutes(routeResult.routes);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof ApiError ? error.message : "Could not load routes.");
        }
      });
    return () => {
      active = false;
    };
  }, [date]);

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setNotice(null);
    try {
      const result = await importRoutes(await file.text());
      setNotice(importNotice(result));
      await refresh();
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? error.message : "Could not import stops.");
    }
  }

  const netsuite = sources.find((source) => source.id === "netsuite");

  return (
    <>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <h2>Service date</h2>
        <label htmlFor="route-date">Date</label>
        <input
          id="route-date"
          type="date"
          value={date}
          onChange={(event) => {
            setNotice(null);
            setDate(event.target.value);
          }}
          required
        />
      </form>
      <div className="panel-actions">
        <button className="primary" type="button" onClick={() => setAddingStop(true)}>
          Add a stop
        </button>
      </div>
      <section className="card stack">
        <h2>Import stops</h2>
        <p className="lede">
          CSV columns: driverEmail, serviceDate, customer, pickup. Optional columns: address, sequence. A
          matching location supplies the address.
        </p>
        <label htmlFor="route-csv">CSV file</label>
        <input id="route-csv" type="file" accept=".csv,text/csv" onChange={(event) => void onImport(event)} />
        {netsuite?.detail ? <p className="lede">{netsuite.detail}</p> : null}
      </section>
      {notice ? <p className="notice">{notice}</p> : null}
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : null}
      {routes.length > 0 ? <LiveSummary routes={routes} /> : null}
      {routes.length === 0 ? (
        <section className="card">
          <h2>Stops</h2>
          <p className="lede">No stops are assigned for this date.</p>
        </section>
      ) : (
        routes.map((route) => (
          <section className="card" key={route.id}>
            <h2>
              {route.driverName}
              <span className="lede">
                {" "}
                · {route.stops.length} {route.stops.length === 1 ? "stop" : "stops"}
              </span>
            </h2>
            <ul className="driver-list">
              {route.stops.map((stop, index) => (
                <li key={stop.id}>
                  <div>
                    <strong>
                      {stop.sequence}. {stop.customerName}
                    </strong>
                    <span>{stop.address}</span>
                    <span>{stop.pickupDescription}</span>
                    <span className="badge">{statusLabels[stop.status]}</span>
                  </div>
                  <StopActivity stop={stop} />
                  {stop.status === "not_started" ? (
                    <div className="row-actions">
                      <button
                        className="secondary"
                        type="button"
                        disabled={index === 0}
                        onClick={() => {
                          const ids = route.stops.map((item) => item.id);
                          [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                          void reorderRoute(route.id, ids)
                            .then((result) => setRoutes(result.routes))
                            .catch((error: unknown) => {
                              setNotice(error instanceof ApiError ? error.message : "Could not reorder stops.");
                            });
                        }}
                      >
                        Move up
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={index === route.stops.length - 1}
                        onClick={() => {
                          const ids = route.stops.map((item) => item.id);
                          [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                          void reorderRoute(route.id, ids)
                            .then((result) => setRoutes(result.routes))
                            .catch((error: unknown) => {
                              setNotice(error instanceof ApiError ? error.message : "Could not reorder stops.");
                            });
                        }}
                      >
                        Move down
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => {
                          void removeStop(stop.id)
                            .then(() => {
                              setNotice(`Removed ${stop.customerName}.`);
                              return refresh();
                            })
                            .catch((error: unknown) => {
                              setNotice(error instanceof ApiError ? error.message : "Could not remove the stop.");
                            });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {addingStop ? (
        <Modal title="Add a stop" onClose={() => setAddingStop(false)}>
          <AddStop
            date={date}
            drivers={drivers}
            customers={customers}
            onCancel={() => setAddingStop(false)}
            onAdded={(name) => {
              setNotice(`${name} was added.`);
              setAddingStop(false);
              void refresh();
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

function AddStop({
  date,
  drivers,
  customers,
  onAdded,
  onCancel,
}: {
  date: string;
  drivers: { id: string; name: string }[];
  customers: CustomerAccount[];
  onAdded: (name: string) => void;
  onCancel: () => void;
}) {
  const [driverUserId, setDriverUserId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [pickupDescription, setPickupDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverUserId && drivers[0]) {
      setDriverUserId(drivers[0].id);
    }
  }, [driverUserId, drivers]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await addRouteStop({
        driverUserId,
        serviceDate: date,
        customerId: customerId || undefined,
        customerName: customerId ? undefined : customerName,
        address: customerId ? undefined : address,
        pickupDescription,
      });
      const location = customers.find((customer) => customer.id === customerId);
      onAdded(location?.name ?? customerName);
      setCustomerId("");
      setCustomerName("");
      setAddress("");
      setPickupDescription("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add the stop.");
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label htmlFor="route-driver">Driver</label>
      <select id="route-driver" value={driverUserId} onChange={(event) => setDriverUserId(event.target.value)} required>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.name}
          </option>
        ))}
      </select>
      <label htmlFor="route-location">Location</label>
      <select id="route-location" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
        <option value="">One-off stop</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
          </option>
        ))}
      </select>
      {customerId ? null : (
        <>
          <label htmlFor="route-customer">Customer name</label>
          <input id="route-customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
          <label htmlFor="route-address">Address</label>
          <input id="route-address" value={address} onChange={(event) => setAddress(event.target.value)} required />
        </>
      )}
      <label htmlFor="route-pickup">Pickup</label>
      <input
        id="route-pickup"
        value={pickupDescription}
        onChange={(event) => setPickupDescription(event.target.value)}
        required
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <button className="primary" type="submit">
          Add stop
        </button>
        <button className="secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LiveSummary({ routes }: { routes: AssignedRoute[] }) {
  const stops = routes.flatMap((route) => route.stops);
  const counts = [
    ["Completed", stops.filter((stop) => stop.status === "completed").length],
    ["En route", stops.filter((stop) => stop.status === "en_route").length],
    ["Not started", stops.filter((stop) => stop.status === "not_started").length],
  ] as const;

  return (
    <div className="live-summary">
      {counts.map(([label, count]) => (
        <div key={label}>
          <b>{count}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function StopActivity({ stop }: { stop: AssignedStop }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button className="secondary" type="button" onClick={() => setOpen((current) => !current)}>
        {open ? "Hide activity" : "Activity"}
      </button>
      {open ? (
        <div>
          <h3>Status history</h3>
          {stop.history.length === 0 ? <p className="lede">No status changes yet.</p> : null}
          <ul className="history">
            {stop.history.map((change) => (
              <li key={change.id}>
                {change.fromStatus ? statusLabels[change.fromStatus] : "Assigned"} → {statusLabels[change.toStatus]}
                {change.changedByName ? ` · ${change.changedByName}` : ""} · {new Date(change.changedAt).toLocaleString()}
              </li>
            ))}
          </ul>
          <h3>Notes</h3>
          {stop.notes.length === 0 ? <p className="lede">No notes yet.</p> : null}
          <div className="activity-notes">
            {stop.notes.map((note) => (
              <p key={note.id}>
                {note.body}
                {note.authorName ? <span className="lede"> · {note.authorName}</span> : null}
              </p>
            ))}
          </div>
          <h3>Photos</h3>
          {stop.photos.length === 0 ? <p className="lede">No photos yet.</p> : null}
          {stop.photos.length > 0 ? (
            <div className="activity-photos">
              {stop.photos.map((photo) => (
                <img key={photo.id} src={`/api/photos/${photo.id}`} alt="" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function importNotice(result: RouteImportResult): string {
  const summary = `Assigned ${result.stops} stops. ${result.createdRoutes} new routes, ${result.replacedRoutes} replaced.`;
  if (result.errors.length === 0) {
    return summary;
  }
  return `${summary} ${result.errors.map((error) => `Row ${error.line}: ${error.message}`).join(" ")}`;
}
