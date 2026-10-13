import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { CustomerAccount, ImportResult } from "@cws/shared";
import { ApiError, createCustomer, importCustomers, listCustomers, updateCustomer } from "./api";
import { Modal } from "./Modal";

export function CustomersPanel() {
  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerAccount | null>(null);

  async function refresh() {
    const result = await listCustomers();
    setCustomers(result.customers);
  }

  useEffect(() => {
    let active = true;
    listCustomers()
      .then((result) => {
        if (active) {
          setCustomers(result.customers);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof ApiError ? error.message : "Could not load locations.");
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
      const result = await importCustomers(await file.text());
      setNotice(importNotice("locations", result));
      await refresh();
    } catch (error: unknown) {
      setNotice(error instanceof ApiError ? error.message : "Could not import locations.");
    }
  }

  return (
    <>
      <CustomerForm
        onSaved={(message) => {
          setNotice(message);
          void refresh();
        }}
      />
      <section className="card stack">
        <h2>Import locations</h2>
        <p className="lede">CSV columns: name, address. Optional column: active.</p>
        <label htmlFor="customer-csv">CSV file</label>
        <input id="customer-csv" type="file" accept=".csv,text/csv" onChange={(event) => void onImport(event)} />
      </section>
      {notice ? <p className="notice">{notice}</p> : null}
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : null}
      <section className="card">
        <h2>Locations</h2>
        {customers.length === 0 ? <p className="lede">No locations yet.</p> : null}
        <ul className="driver-list">
          {customers.map((customer) => (
            <li key={customer.id}>
              <div>
                <strong>{customer.name}</strong>
                <span>{customer.address}</span>
                {customer.active ? null : <span className="badge">Inactive</span>}
              </div>
              <div className="row-actions">
                <button className="secondary" type="button" onClick={() => setEditing(customer)}>
                  Edit
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void updateCustomer(customer.id, { active: !customer.active })
                      .then(() => {
                        setNotice(
                          customer.active
                            ? `${customer.name} is inactive and will stay off new routes.`
                            : `${customer.name} is active again.`,
                        );
                        return refresh();
                      })
                      .catch((error: unknown) => {
                        setNotice(error instanceof ApiError ? error.message : "Could not update the location.");
                      });
                  }}
                >
                  {customer.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {editing ? (
        <Modal title="Edit location" onClose={() => setEditing(null)}>
          <CustomerForm
            key={editing.id}
            editing={editing}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setNotice(message);
              setEditing(null);
              void refresh();
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}

function CustomerForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing?: CustomerAccount | null;
  onSaved: (message: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editing);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateCustomer(editing.id, { name, address });
        onSaved(`Saved ${name}.`);
      } else {
        await createCustomer({ name, address });
        onSaved(`${name} is ready to assign.`);
        setName("");
        setAddress("");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the location.");
    }
  }

  const fields = (
    <>
      <label htmlFor={isEditing ? "edit-customer-name" : "customer-name"}>Name</label>
      <input
        id={isEditing ? "edit-customer-name" : "customer-name"}
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <label htmlFor={isEditing ? "edit-customer-address" : "customer-address"}>Address</label>
      <input
        id={isEditing ? "edit-customer-address" : "customer-address"}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        required
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row-actions">
        <button className="primary" type="submit">
          {isEditing ? "Save location" : "Add location"}
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
      <h2>New location</h2>
      {fields}
    </form>
  );
}

function importNotice(kind: string, result: ImportResult): string {
  const summary = `Imported ${result.created + result.updated} ${kind}. ${result.created} new, ${result.updated} updated.`;
  if (result.errors.length === 0) {
    return summary;
  }
  const details = result.errors.map((error) => `Row ${error.line}: ${error.message}`).join(" ");
  return `${summary} ${details}`;
}
