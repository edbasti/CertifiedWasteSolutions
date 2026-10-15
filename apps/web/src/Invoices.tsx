import { useState } from "react";
import type { InvoiceRecord } from "@cws/shared";
import { ApiError, searchInvoices, sendInvoice } from "./api";

function sentLabel(sentAt: string | null): string | null {
  if (!sentAt) {
    return null;
  }
  return `Sent ${new Date(sentAt).toLocaleString()}`;
}

export function InvoicesPanel() {
  const [driverQuery, setDriverQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [matches, setMatches] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setError(null);
    setNotice(null);
    try {
      const result = await searchInvoices(driverQuery, dateQuery);
      setMatches(result.invoices);
      if (result.invoices.length === 0) {
        setNotice("No invoices match that driver and date.");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not search invoices.");
    }
  }

  async function send(invoiceId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendInvoice(invoiceId);
      setMatches((current) => current.map((item) => (item.id === result.invoice.id ? result.invoice : item)));
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

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Accounting</p>
          <h2>Invoices</h2>
          <p className="lede">Every invoice is generated from a submitted driver log.</p>
        </div>
      </div>

      <section className="card stack">
        <h2>Find an invoice</h2>
        <label htmlFor="invoice-driver">Driver</label>
        <input id="invoice-driver" value={driverQuery} onChange={(event) => setDriverQuery(event.target.value)} />
        <label htmlFor="invoice-date">Service date</label>
        <input id="invoice-date" type="date" value={dateQuery} onChange={(event) => setDateQuery(event.target.value)} />
        <div className="row-actions">
          <button className="primary" type="button" onClick={() => void search()}>
            Search
          </button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="notice">{notice}</p> : null}
        {matches.length === 0 ? (
          <p className="lede">Search by driver name and service date after a log has been completed.</p>
        ) : (
          <ul className="driver-list">
            {matches.map((invoice) => {
              const sent = sentLabel(invoice.sentToAccountingAt);
              return (
                <li key={invoice.id}>
                  <div>
                    <strong>
                      {invoice.invoiceNumber} · {invoice.driverName}
                    </strong>
                    <span>{invoice.serviceDate}</span>
                    {sent ? <span className="badge">{sent}</span> : null}
                  </div>
                  <div className="row-actions">
                    <a className="secondary" href={`/api/invoices/${invoice.id}/pdf`}>
                      Invoice PDF
                    </a>
                    <a className="secondary" href={`/api/logs/${invoice.logId}/pdf`}>
                      Log PDF
                    </a>
                    {sent ? null : (
                      <button className="primary" type="button" disabled={busy} onClick={() => void send(invoice.id)}>
                        Send to accounting
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
