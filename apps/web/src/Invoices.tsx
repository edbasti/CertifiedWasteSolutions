import { useEffect, useMemo, useState } from "react";
import type { InvoiceRecord } from "@cws/shared";
import { ApiError, searchInvoices, sendInvoice } from "./api";

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function monthKey(serviceDate: string) {
  return serviceDate.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) {
    return "This month";
  }
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long" });
}

function exportCsv(invoices: InvoiceRecord[]) {
  const header = ["invoiceNumber", "driverName", "serviceDate", "amount", "status", "sentToAccountingAt"];
  const rows = invoices.map((invoice) => [
    invoice.invoiceNumber,
    invoice.driverName,
    invoice.serviceDate,
    (invoice.priceTotalCents / 100).toFixed(2),
    invoice.sentToAccountingAt ? "Sent" : "Ready",
    invoice.sentToAccountingAt ?? "",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "invoices.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function InvoicesPanel() {
  const [driverQuery, setDriverQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load(driver = driverQuery, date = dateQuery) {
    setError(null);
    try {
      const result = await searchInvoices(driver, date);
      setInvoices(result.invoices);
      setLoaded(true);
      if (result.invoices.length === 0 && (driver.trim() || date)) {
        setNotice("No invoices match that driver and date.");
      } else {
        setNotice(null);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load invoices.");
    }
  }

  useEffect(() => {
    let active = true;
    searchInvoices("", "")
      .then((result) => {
        if (active) {
          setInvoices(result.invoices);
          setLoaded(true);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load invoices.");
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function send(invoiceId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendInvoice(invoiceId);
      setInvoices((current) => current.map((item) => (item.id === result.invoice.id ? result.invoice : item)));
      setNotice(
        result.emailed
          ? `Invoice ${result.invoice.invoiceNumber} was emailed to accounting.`
          : `Invoice ${result.invoice.invoiceNumber} is marked sent. Email is not configured, so download the PDF.`,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not send the invoice.");
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const currentMonth = localMonth();
    const monthInvoices = invoices.filter((invoice) => monthKey(invoice.serviceDate) === currentMonth);
    const needsReview = invoices.filter((invoice) => !invoice.sentToAccountingAt);
    const totalBilled = invoices.reduce((sum, invoice) => sum + invoice.priceTotalCents, 0);
    const monthReady = monthInvoices.filter((invoice) => invoice.sentToAccountingAt).length;
    return {
      monthCount: monthInvoices.length,
      monthReady,
      needsReview: needsReview.length,
      totalBilled,
      monthName: monthLabel(currentMonth),
    };
  }, [invoices]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Accounting</p>
          <h2>Invoices</h2>
          <p className="lede">Every invoice is generated from a submitted driver log.</p>
        </div>
        <button className="primary" type="button" disabled={invoices.length === 0} onClick={() => exportCsv(invoices)}>
          ↓ Export CSV
        </button>
      </div>

      <div className="stats invoice-stats">
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">{stats.monthName} invoices</span>
            <span className="stat-icon green">▧</span>
          </div>
          <strong>{stats.monthCount}</strong>
          <small>
            <b>{stats.monthReady} sent</b> and ready
          </small>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">Needs review</span>
            <span className="stat-icon orange">!</span>
          </div>
          <strong>{stats.needsReview}</strong>
          <small>Before accounting export</small>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span className="stat-label">Total billed</span>
            <span className="stat-icon blue">$</span>
          </div>
          <strong>{money(stats.totalBilled)}</strong>
          <small>Across loaded invoices</small>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          id="invoice-driver"
          placeholder="⌕  Search driver"
          value={driverQuery}
          onChange={(event) => setDriverQuery(event.target.value)}
        />
        <input
          className="filter"
          id="invoice-date"
          type="date"
          value={dateQuery}
          aria-label="Service date"
          onChange={(event) => setDateQuery(event.target.value)}
        />
        <button className="primary" type="button" onClick={() => void load()}>
          Search
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="card table-card">
        <table className="route-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Driver</th>
              <th>Service date</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!loaded ? (
              <tr>
                <td colSpan={6}>
                  <p className="empty-copy">Loading invoices…</p>
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="empty-copy">No invoices yet. Complete a driver log to generate one.</p>
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const sent = Boolean(invoice.sentToAccountingAt);
                return (
                  <tr key={invoice.id}>
                    <td>
                      <span className="invoice">{invoice.invoiceNumber}</span>
                      <span className="address">Generated from {invoice.logType.replaceAll("_", " ")} log</span>
                    </td>
                    <td>{invoice.driverName}</td>
                    <td>
                      {new Date(`${invoice.serviceDate}T12:00:00`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td>
                      <b>{money(invoice.priceTotalCents)}</b>
                    </td>
                    <td>
                      <span className={sent ? "status complete" : "status warn"}>{sent ? "Sent" : "Ready"}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <a className="action-link" href={`/api/invoices/${invoice.id}/pdf`}>
                          PDF ↓
                        </a>
                        <a className="action-link" href={`/api/logs/${invoice.logId}/pdf`}>
                          Log
                        </a>
                        {sent ? null : (
                          <button className="action-link" type="button" disabled={busy} onClick={() => void send(invoice.id)}>
                            Send
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="table-foot">
          Invoices are generated when a submitted driver log is completed in Driver Logs.
        </div>
      </div>
    </>
  );
}

function localMonth() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 7);
}
