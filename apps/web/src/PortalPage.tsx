import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { appName, type DriverAccount, type ImportResult } from "@cws/shared";
import { ApiError, createDriver, importDrivers, listDrivers, resetDriverAccess, updateDriver } from "./api";
import { CustomersPanel } from "./customers";
import { LogsPanel } from "./logs-review";
import { Modal } from "./Modal";
import { NetSuitePanel } from "./netsuite";
import { ReportsPanel } from "./reports";
import { RoutesPanel } from "./routes";
import { useSession } from "./session";

export function PortalPage() {
  const { user, logout } = useSession();
  const isAdmin = user?.role === "admin";
  const [section, setSection] = useState<"customers" | "drivers" | "routes" | "logs" | "reports" | "netsuite">("customers");

  return (
    <div className="shell">
      <header className="topbar">
        <strong>{appName}</strong>
        <div className="topbar-actions">
          <span>
            {user?.name} · {user?.role}
          </span>
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content directory">
        <p className="eyebrow">Portal</p>
        <h1>Operations</h1>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={section === "customers"} onClick={() => setSection("customers")}>
            Locations
          </button>
          {isAdmin ? (
            <button type="button" role="tab" aria-selected={section === "drivers"} onClick={() => setSection("drivers")}>
              Drivers
            </button>
          ) : null}
          {isAdmin ? (
            <button type="button" role="tab" aria-selected={section === "netsuite"} onClick={() => setSection("netsuite")}>
              NetSuite
            </button>
          ) : null}
          <button type="button" role="tab" aria-selected={section === "routes"} onClick={() => setSection("routes")}>
            Routes
          </button>
          <button type="button" role="tab" aria-selected={section === "logs"} onClick={() => setSection("logs")}>
            Driver logs
          </button>
          <button type="button" role="tab" aria-selected={section === "reports"} onClick={() => setSection("reports")}>
            Stop reports
          </button>
        </div>
        {section === "drivers" && isAdmin ? <DriverAdmin /> : null}
        {section === "netsuite" && isAdmin ? <NetSuitePanel /> : null}
        {section === "customers" ? <CustomersPanel /> : null}
        {section === "routes" ? <RoutesPanel /> : null}
        {section === "logs" ? <LogsPanel /> : null}
        {section === "reports" ? <ReportsPanel /> : null}
      </main>
    </div>
  );
}

function DriverAdmin() {
  const [drivers, setDrivers] = useState<DriverAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<DriverAccount | null>(null);

  async function refresh() {
    const result = await listDrivers();
    setDrivers(result.drivers);
  }

  useEffect(() => {
    let active = true;
    listDrivers()
      .then((result) => {
        if (active) {
          setDrivers(result.drivers);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof ApiError ? error.message : "Could not load drivers.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setNotice(null);
    try {
      const result = await importDrivers(await file.text());
      setNotice(driverImportNotice(result));
      await refresh();
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? error.message : "Could not import drivers.");
    }
  }

  return (
    <>
      <CreateDriver
        onCreated={(name) => {
          setNotice(`${name} can sign in with the password you set.`);
          void refresh();
        }}
      />
      <section className="card stack">
        <h2>Import drivers</h2>
        <p className="lede">CSV columns: name, email, password. Optional columns: companyName, active.</p>
        <label htmlFor="driver-csv">CSV file</label>
        <input id="driver-csv" type="file" accept=".csv,text/csv" onChange={(event) => void onImport(event)} />
      </section>
      {notice ? <p className="notice">{notice}</p> : null}
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : null}
      <section className="card">
        <h2>Drivers</h2>
        <ul className="driver-list">
          {drivers.map((driver) => (
            <li key={driver.id}>
              <div>
                <strong>{driver.name}</strong>
                <span>
                  {driver.email}
                  {driver.companyName ? ` · ${driver.companyName}` : ""}
                </span>
                {driver.active ? null : <span className="badge">Inactive</span>}
              </div>
              <div className="row-actions">
                <button className="secondary" type="button" onClick={() => setEditing(driver)}>
                  Edit
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void updateDriver(driver.id, { active: !driver.active })
                      .then(() => {
                        setNotice(
                          driver.active
                            ? `${driver.name} is inactive. Their current sign-in was ended.`
                            : `${driver.name} can sign in again.`,
                        );
                        return refresh();
                      })
                      .catch((error: unknown) => {
                        setNotice(error instanceof ApiError ? error.message : "Could not update the driver.");
                      });
                  }}
                >
                  {driver.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
              <ResetAccess
                driverId={driver.id}
                onReset={() => setNotice(`Access reset for ${driver.name}. Previous sign-ins were ended.`)}
              />
            </li>
          ))}
        </ul>
      </section>
      {editing ? (
        <Modal title="Edit driver" onClose={() => setEditing(null)}>
          <CreateDriver
            key={editing.id}
            editing={editing}
            onCancel={() => setEditing(null)}
            onSaved={(name) => {
              setNotice(`Saved ${name}.`);
              setEditing(null);
              void refresh();
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

function driverImportNotice(result: ImportResult): string {
  const summary = `Imported ${result.created + result.updated} drivers. ${result.created} new, ${result.updated} updated.`;
  if (result.errors.length === 0) {
    return summary;
  }
  return `${summary} ${result.errors.map((error) => `Row ${error.line}: ${error.message}`).join(" ")}`;
}

function CreateDriver({
  editing,
  onCreated,
  onSaved,
  onCancel,
}: {
  editing?: DriverAccount | null;
  onCreated?: (name: string) => void;
  onSaved?: (name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [companyName, setCompanyName] = useState(editing?.companyName ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editing);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateDriver(editing.id, { name, email, companyName });
        onSaved?.(name);
      } else {
        await createDriver({ name, email, companyName, password });
        onCreated?.(name);
        setName("");
        setEmail("");
        setCompanyName("");
        setPassword("");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the driver.");
    }
  }

  const nameId = isEditing ? "edit-driver-name" : "driver-name";
  const emailId = isEditing ? "edit-driver-email" : "driver-email";
  const companyId = isEditing ? "edit-driver-company" : "driver-company";

  const fields = (
    <>
      <label htmlFor={nameId}>Name</label>
      <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} required />
      <label htmlFor={emailId}>Email</label>
      <input
        id={emailId}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor={companyId}>Company name</label>
      <input id={companyId} value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
      {isEditing ? null : (
        <>
          <label htmlFor="driver-password">Password</label>
          <input
            id="driver-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <button className="primary" type="submit">
          {isEditing ? "Save driver" : "Create driver"}
        </button>
        {isEditing && onCancel ? (
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </>
  );

  if (isEditing) {
    return (
      <form className="stack" onSubmit={onSubmit}>
        {fields}
      </form>
    );
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>New driver</h2>
      {fields}
    </form>
  );
}

function ResetAccess({ driverId, onReset }: { driverId: string; onReset: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await resetDriverAccess(driverId, password);
      setPassword("");
      onReset();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reset access.");
    }
  }

  return (
    <form className="reset-access" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={`reset-${driverId}`}>
        New password
      </label>
      <input
        id={`reset-${driverId}`}
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        minLength={8}
      />
      <button className="primary" type="submit">
        Reset access
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
