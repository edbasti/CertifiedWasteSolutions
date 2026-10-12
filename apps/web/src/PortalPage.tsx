import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { appName, type DriverAccount, type ImportResult } from "@cws/shared";
import { ApiError, createDriver, importDrivers, listDrivers, resetDriverAccess, updateDriver } from "./api";
import { CustomersPanel } from "./customers";
import { LogsPanel } from "./logs-review";
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
            Logs
          </button>
          <button type="button" role="tab" aria-selected={section === "reports"} onClick={() => setSection("reports")}>
            Reports
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
        editing={editing}
        onCancel={() => setEditing(null)}
        onCreated={(name) => {
          setNotice(`${name} can sign in with the password you set.`);
          setEditing(null);
          void refresh();
        }}
        onSaved={(name) => {
          setNotice(`Saved ${name}.`);
          setEditing(null);
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
  editing: DriverAccount | null;
  onCreated: (name: string) => void;
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(editing?.name ?? "");
    setEmail(editing?.email ?? "");
    setCompanyName(editing?.companyName ?? "");
    setPassword("");
    setError(null);
  }, [editing]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateDriver(editing.id, { name, email, companyName });
        onSaved(name);
      } else {
        await createDriver({ name, email, companyName, password });
        onCreated(name);
        setName("");
        setEmail("");
        setCompanyName("");
        setPassword("");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the driver.");
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>{editing ? "Edit driver" : "New driver"}</h2>
      <label htmlFor="driver-name">Name</label>
      <input id="driver-name" value={name} onChange={(event) => setName(event.target.value)} required />
      <label htmlFor="driver-email">Email</label>
      <input
        id="driver-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="driver-company">Company name</label>
      <input id="driver-company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
      {editing ? null : (
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
          {editing ? "Save driver" : "Create driver"}
        </button>
        {editing ? (
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
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
