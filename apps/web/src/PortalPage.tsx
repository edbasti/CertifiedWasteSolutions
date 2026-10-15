import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { type DriverAccount, type ImportResult } from "@cws/shared";
import { ApiError, createDriver, importDrivers, listDrivers, resetDriverAccess, updateDriver } from "./api";
import { CustomersPanel } from "./customers";
import { DashboardPanel } from "./Dashboard";
import { InvoicesPanel } from "./Invoices";
import { LogsPanel } from "./logs-review";
import { Modal } from "./Modal";
import { NetSuitePanel } from "./netsuite";
import { ReportsPanel } from "./reports";
import { RoutesPanel } from "./routes";
import { useSession } from "./session";

type PortalSection =
  | "dashboard"
  | "routes"
  | "logs"
  | "invoices"
  | "reports"
  | "customers"
  | "drivers"
  | "netsuite";

const sectionMeta: Record<PortalSection, { eyebrow: string; title: string; lede: string }> = {
  dashboard: {
    eyebrow: "Operations portal",
    title: "Today's overview",
    lede: "Watch live route progress across your team.",
  },
  routes: {
    eyebrow: "Operations",
    title: "Routes & stops",
    lede: "Monitor every stop and status change as it happens.",
  },
  logs: {
    eyebrow: "Digital paperwork",
    title: "Driver logs",
    lede: "Submitted logs are locked and ready for review.",
  },
  invoices: {
    eyebrow: "Accounting",
    title: "Invoices",
    lede: "Every invoice is generated from a submitted driver log.",
  },
  reports: {
    eyebrow: "Insights",
    title: "Reports & analytics",
    lede: "Measure completed stops, route timing, and driver activity.",
  },
  customers: {
    eyebrow: "Directory",
    title: "Customers & locations",
    lede: "Manage service locations and assignments.",
  },
  drivers: {
    eyebrow: "Team access",
    title: "Drivers",
    lede: "Create accounts, reset access, and review route activity.",
  },
  netsuite: {
    eyebrow: "Integrations",
    title: "NetSuite",
    lede: "Connection status and mapping for future stop imports.",
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PortalPage() {
  const { user, logout } = useSession();
  const isAdmin = user?.role === "admin";
  const [section, setSection] = useState<PortalSection>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const meta = sectionMeta[section];

  function go(next: PortalSection) {
    setSection(next);
    setNavOpen(false);
  }

  return (
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <aside className="sidebar" aria-label="Portal navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            C
          </div>
          <div>
            <strong>Certified Waste</strong>
            <span>Solutions</span>
          </div>
        </div>
        <div>
          <div className="nav-label">Workspace</div>
          <nav className="side-nav">
            <button type="button" className={section === "dashboard" ? "active" : undefined} onClick={() => go("dashboard")}>
              <span aria-hidden="true">▦</span>
              <span>Dashboard</span>
            </button>
            <button type="button" className={section === "routes" ? "active" : undefined} onClick={() => go("routes")}>
              <span aria-hidden="true">⌁</span>
              <span>Routes &amp; Stops</span>
            </button>
            <button type="button" className={section === "logs" ? "active" : undefined} onClick={() => go("logs")}>
              <span aria-hidden="true">▤</span>
              <span>Driver Logs</span>
            </button>
            <button type="button" className={section === "invoices" ? "active" : undefined} onClick={() => go("invoices")}>
              <span aria-hidden="true">▧</span>
              <span>Invoices</span>
            </button>
            <button type="button" className={section === "reports" ? "active" : undefined} onClick={() => go("reports")}>
              <span aria-hidden="true">◒</span>
              <span>Reports</span>
            </button>
          </nav>
        </div>
        <div>
          <div className="nav-label">Manage</div>
          <nav className="side-nav">
            <button type="button" className={section === "customers" ? "active" : undefined} onClick={() => go("customers")}>
              <span aria-hidden="true">♧</span>
              <span>Customers</span>
            </button>
            {isAdmin ? (
              <button type="button" className={section === "drivers" ? "active" : undefined} onClick={() => go("drivers")}>
                <span aria-hidden="true">♙</span>
                <span>Drivers</span>
              </button>
            ) : null}
            {isAdmin ? (
              <button type="button" className={section === "netsuite" ? "active" : undefined} onClick={() => go("netsuite")}>
                <span aria-hidden="true">⬡</span>
                <span>NetSuite</span>
              </button>
            ) : null}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{initials(user?.name ?? "U")}</div>
            <div>
              <b>{user?.name}</b>
              <small>{user?.role === "admin" ? "Administrator" : "Manager"}</small>
            </div>
          </div>
          <button className="sidebar-signout" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      {navOpen ? <button className="nav-backdrop" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}

      <div className="main">
        <header className="portal-topbar">
          <div className="portal-topbar-copy">
            <button className="menu-toggle" type="button" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              ☰
            </button>
            <div>
              <p className="eyebrow">{meta.eyebrow}</p>
              <h1>{meta.title}</h1>
            </div>
          </div>
          <div className="top-actions">
            <Link className="portal-home" to="/">
              ← Homepage
            </Link>
            <div className="date-pill">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        </header>

        <section className="portal-content">
          {section === "dashboard" ? <DashboardPanel onOpenRoutes={() => go("routes")} /> : null}
          {section === "routes" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{meta.eyebrow}</p>
                  <h2>{meta.title}</h2>
                  <p className="lede">{meta.lede}</p>
                </div>
              </div>
              <RoutesPanel />
            </>
          ) : null}
          {section === "logs" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{meta.eyebrow}</p>
                  <h2>{meta.title}</h2>
                  <p className="lede">{meta.lede}</p>
                </div>
              </div>
              <LogsPanel />
            </>
          ) : null}
          {section === "invoices" ? <InvoicesPanel /> : null}
          {section === "reports" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{meta.eyebrow}</p>
                  <h2>{meta.title}</h2>
                  <p className="lede">{meta.lede}</p>
                </div>
              </div>
              <ReportsPanel />
            </>
          ) : null}
          {section === "customers" ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{meta.eyebrow}</p>
                  <h2>{meta.title}</h2>
                  <p className="lede">{meta.lede}</p>
                </div>
              </div>
              <CustomersPanel />
            </>
          ) : null}
          {section === "drivers" && isAdmin ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{meta.eyebrow}</p>
                  <h2>{meta.title}</h2>
                  <p className="lede">{meta.lede}</p>
                </div>
              </div>
              <DriverAdmin />
            </>
          ) : null}
          {section === "netsuite" && isAdmin ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{meta.eyebrow}</p>
                  <h2>{meta.title}</h2>
                  <p className="lede">{meta.lede}</p>
                </div>
              </div>
              <NetSuitePanel />
            </>
          ) : null}
        </section>
      </div>
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
