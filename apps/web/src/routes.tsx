import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  serviceTypeLabels,
  serviceTypes,
  type AssignedRoute,
  type AssignedStop,
  type CustomerAccount,
  type RouteImportResult,
  type ServiceType,
  type StopSourceInfo,
  type StopStatus,
} from "@cws/shared";
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

function lastStatusChange(stop: AssignedStop) {
  const last = stop.history.at(-1);
  if (!last) {
    return "Not changed yet";
  }
  return new Date(last.changedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type FlatStop = {
  stop: AssignedStop;
  route: AssignedRoute;
  index: number;
};

export function RoutesPanel() {
  const [date, setDate] = useState(localDate);
  const [routes, setRoutes] = useState<AssignedRoute[]>([]);
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [sources, setSources] = useState<StopSourceInfo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingStop, setAddingStop] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | StopStatus>("");
  const [details, setDetails] = useState<FlatStop | null>(null);

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

  const flatStops = useMemo(
    () =>
      routes.flatMap((route) =>
        route.stops.map((stop, index) => ({
          stop,
          route,
          index,
        })),
      ),
    [routes],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return flatStops.filter(({ stop, route }) => {
      if (driverFilter && route.driverUserId !== driverFilter) {
        return false;
      }
      if (statusFilter && stop.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        stop.customerName.toLowerCase().includes(query) ||
        stop.address.toLowerCase().includes(query) ||
        serviceTypeLabels[stop.serviceType].toLowerCase().includes(query) ||
        stop.driverNotes.toLowerCase().includes(query) ||
        stop.pickupDescription.toLowerCase().includes(query) ||
        route.driverName.toLowerCase().includes(query)
      );
    });
  }, [driverFilter, flatStops, search, statusFilter]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Routes & stops</h2>
          <p className="lede">Monitor every stop and status change as it happens.</p>
        </div>
        <div className="panel-actions">
          <button className="secondary" type="button" onClick={() => setImporting(true)}>
            Import stops
          </button>
          <button className="primary" type="button" onClick={() => setAddingStop(true)}>
            ＋ Add a stop
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="⌕  Search customer or address"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          className="filter"
          id="route-date"
          type="date"
          value={date}
          aria-label="Service date"
          onChange={(event) => {
            setNotice(null);
            setDate(event.target.value);
          }}
        />
        <select className="filter" value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} aria-label="Driver">
          <option value="">All drivers</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
        <select
          className="filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "" | StopStatus)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="en_route">En Route</option>
          <option value="not_started">Not Started</option>
        </select>
      </div>

      {notice ? <p className="notice">{notice}</p> : null}
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="card table-card">
        <table className="route-table">
          <thead>
            <tr>
              <th>Stop</th>
              <th>Driver</th>
              <th>Last status change</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <p className="empty-copy">
                    {flatStops.length === 0
                      ? "No stops are assigned for this date."
                      : "No stops match those filters."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map(({ stop, route, index }) => (
                <tr key={stop.id}>
                  <td>
                    <div className="customer">
                      <div className="customer-mark">{initials(stop.customerName)}</div>
                      <div className="customer-copy">
                        <span className="customer-title">
                          {stop.sequence}. {stop.customerName}
                        </span>
                        <span className="subtext">
                          {stop.address}
                          {" · "}
                          {serviceTypeLabels[stop.serviceType]} · Qty {stop.quantity}
                          {stop.driverNotes ? ` · ${stop.driverNotes}` : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{route.driverName}</td>
                  <td className="subtext">{lastStatusChange(stop)}</td>
                  <td>
                    <span className={statusClass(stop.status)}>{statusLabels[stop.status]}</span>
                  </td>
                  <td>
                    <button
                      className="action-link"
                      type="button"
                      onClick={() => setDetails({ stop, route, index })}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="table-foot">
          Showing {filtered.length} of {flatStops.length}{" "}
          {flatStops.length === 1 ? "stop" : "stops"} scheduled for {date}.
        </div>
      </div>

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
      {importing ? (
        <Modal title="Import stops" onClose={() => setImporting(false)}>
          <div className="stack">
            <p className="lede">
              CSV columns: driverEmail, serviceDate, customer, pickup. Optional columns: address, sequence. A
              matching location supplies the address.
            </p>
            <label htmlFor="route-csv">CSV file</label>
            <input
              id="route-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void (async () => {
                  await onImport(event);
                  setImporting(false);
                })();
              }}
            />
            {netsuite?.detail ? <p className="lede">{netsuite.detail}</p> : null}
            <div className="row-actions">
              <button className="secondary" type="button" onClick={() => setImporting(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {details ? (
        <Modal title={`${details.stop.customerName}`} onClose={() => setDetails(null)}>
          <StopDetails
            item={details}
            onClose={() => setDetails(null)}
            onChanged={(nextRoutes, message) => {
              setRoutes(nextRoutes);
              setNotice(message);
              const next = nextRoutes
                .flatMap((route) => route.stops.map((stop, index) => ({ stop, route, index })))
                .find((item) => item.stop.id === details.stop.id);
              setDetails(next ?? null);
            }}
            onRemoved={(message) => {
              setNotice(message);
              setDetails(null);
              void refresh();
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

function StopDetails({
  item,
  onClose,
  onChanged,
  onRemoved,
}: {
  item: FlatStop;
  onClose: () => void;
  onChanged: (routes: AssignedRoute[], message: string) => void;
  onRemoved: (message: string) => void;
}) {
  const { stop, route, index } = item;
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack">
      <p className="lede">{stop.address}</p>
      <p className="lede">
        {serviceTypeLabels[stop.serviceType]} · Qty {stop.quantity}
      </p>
      {stop.driverNotes ? <p className="lede">Driver notes: {stop.driverNotes}</p> : null}
      <p>
        <span className={statusClass(stop.status)}>{statusLabels[stop.status]}</span>
        <span className="subtext"> · {route.driverName}</span>
      </p>
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
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {stop.status === "not_started" ? (
        <div className="row-actions">
          <button
            className="secondary"
            type="button"
            disabled={index === 0}
            onClick={() => {
              const ids = route.stops.map((entry) => entry.id);
              [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
              void reorderRoute(route.id, ids)
                .then((result) => {
                  setError(null);
                  onChanged(result.routes, `Moved ${stop.customerName} up.`);
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof ApiError ? caught.message : "Could not reorder stops.");
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
              const ids = route.stops.map((entry) => entry.id);
              [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
              void reorderRoute(route.id, ids)
                .then((result) => {
                  setError(null);
                  onChanged(result.routes, `Moved ${stop.customerName} down.`);
                })
                .catch((caught: unknown) => {
                  setError(caught instanceof ApiError ? caught.message : "Could not reorder stops.");
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
                .then(() => onRemoved(`Removed ${stop.customerName}.`))
                .catch((caught: unknown) => {
                  setError(caught instanceof ApiError ? caught.message : "Could not remove the stop.");
                });
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
      <div className="row-actions">
        <button className="secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
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
  const [serviceType, setServiceType] = useState<ServiceType>("remove");
  const [quantity, setQuantity] = useState("1");
  const [driverNotes, setDriverNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverUserId && drivers[0]) {
      setDriverUserId(drivers[0].id);
    }
  }, [driverUserId, drivers]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError("Quantity must be a whole number of at least 1.");
      return;
    }
    try {
      await addRouteStop({
        driverUserId,
        serviceDate: date,
        customerId: customerId || undefined,
        customerName: customerId ? undefined : customerName,
        address: customerId ? undefined : address,
        serviceType,
        quantity: qty,
        driverNotes,
      });
      const location = customers.find((customer) => customer.id === customerId);
      onAdded(location?.name ?? customerName);
      setCustomerId("");
      setCustomerName("");
      setAddress("");
      setServiceType("remove");
      setQuantity("1");
      setDriverNotes("");
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
          <label htmlFor="route-customer">Company / customer name</label>
          <input id="route-customer" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
          <label htmlFor="route-address">Address</label>
          <input id="route-address" value={address} onChange={(event) => setAddress(event.target.value)} required />
        </>
      )}
      <label htmlFor="route-service-type">Service type</label>
      <select
        id="route-service-type"
        value={serviceType}
        onChange={(event) => setServiceType(event.target.value as ServiceType)}
        required
      >
        {serviceTypes.map((type) => (
          <option key={type} value={type}>
            {serviceTypeLabels[type]}
          </option>
        ))}
      </select>
      <label htmlFor="route-quantity">Quantity</label>
      <input
        id="route-quantity"
        type="number"
        min={1}
        step={1}
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
        required
      />
      <label htmlFor="route-driver-notes">Notes for driver</label>
      <input
        id="route-driver-notes"
        value={driverNotes}
        onChange={(event) => setDriverNotes(event.target.value)}
        placeholder="e.g. gate code 456"
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

function importNotice(result: RouteImportResult): string {
  const summary = `Assigned ${result.stops} stops. ${result.createdRoutes} new routes, ${result.replacedRoutes} replaced.`;
  if (result.errors.length === 0) {
    return summary;
  }
  return `${summary} ${result.errors.map((error) => `Row ${error.line}: ${error.message}`).join(" ")}`;
}
