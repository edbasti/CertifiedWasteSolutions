import { useEffect, useState } from "react";
import { logFieldMap, logTypeLabels, type DriverLog, type DriverLogLine, type LogSummary } from "@cws/shared";
import { ApiError, completeLog, correctLog, listLogsForReview, readLog, searchInvoices, sendInvoice } from "./api";
import type { InvoiceRecord } from "@cws/shared";

const statusLabels: Record<DriverLog["status"], string> = {
  draft: "Draft",
  submitted: "Waiting for the manager",
  manager_review: "Ready for invoice",
  invoiced: "Invoiced",
  corrected: "Corrected",
};

function dollars(cents: number | null): string {
  if (cents === null) {
    return "";
  }
  return (cents / 100).toFixed(2);
}

function cents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a price like 125.00.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function displayCorrection(fieldKey: string, value: string | null): string {
  if (!value) {
    return "blank";
  }
  if (fieldKey === "price") {
    return dollars(Number(value));
  }
  if (fieldKey === "multiStopLoad") {
    return value === "true" ? "Yes" : "No";
  }
  return value;
}

function sentLabel(sentAt: string | null): string | null {
  if (!sentAt) {
    return null;
  }
  return `Sent ${new Date(sentAt).toLocaleString()}`;
}

function InvoiceFiles({
  invoiceId,
  logId,
  sentToAccountingAt,
  busy,
  onSend,
}: {
  invoiceId: string;
  logId: string;
  sentToAccountingAt: string | null;
  busy: boolean;
  onSend: (invoiceId: string) => void;
}) {
  const label = sentLabel(sentToAccountingAt);
  return (
    <div className="row-actions">
      <a className="secondary" href={`/api/invoices/${invoiceId}/pdf`}>
        Invoice PDF
      </a>
      <a className="secondary" href={`/api/logs/${logId}/pdf`}>
        Log PDF
      </a>
      {label ? (
        <span className="badge">{label}</span>
      ) : (
        <button className="primary" type="button" disabled={busy} onClick={() => onSend(invoiceId)}>
          Send to accounting
        </button>
      )}
    </div>
  );
}

function submittedValue(log: DriverLog, lineId: string | null, fieldKey: string): string | null {
  const first = log.corrections.find((entry) => entry.lineId === lineId && entry.fieldKey === fieldKey);
  return first ? displayCorrection(fieldKey, first.previousValue) : null;
}

export function LogsPanel() {
  const [logs, setLogs] = useState<LogSummary[]>([]);
  const [selected, setSelected] = useState<DriverLog | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driverQuery, setDriverQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [matches, setMatches] = useState<InvoiceRecord[]>([]);

  async function refresh(selectId?: string) {
    const result = await listLogsForReview();
    setLogs(result.logs);
    if (selectId) {
      const detail = await readLog(selectId);
      apply(detail.log);
    }
  }

  function apply(log: DriverLog) {
    setSelected(log);
    setCompanyName(log.driverCompanyName);
    setPaymentDate(log.logType === "port" ? (log.paymentDateFriday ?? "") : (log.datePaid ?? ""));
    setPrices(Object.fromEntries(log.lines.map((line) => [line.id, dollars(line.priceCents)])));
  }

  useEffect(() => {
    let active = true;
    listLogsForReview()
      .then((result) => {
        if (active) {
          setLogs(result.logs);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load logs.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const paymentField = selected ? logFieldMap[selected.logType].find((field) => field.filledBy === "manager") : undefined;
  const editable = selected !== null && selected.status !== "submitted";

  async function complete() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await completeLog(selected.id, paymentDate);
      apply(result.log);
      await refresh(result.log.id);
      setNotice(`Invoice ${result.invoice.invoiceNumber} is ready to download.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not complete the log.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCorrection() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const lines: DriverLogLine[] = selected.lines.map((line) => ({ ...line, priceCents: cents(prices[line.id] ?? "") }));
      const result = await correctLog(selected.id, { driverCompanyName: companyName, paymentDate, lines });
      apply(result.log);
      await refresh(result.log.id);
      setNotice("Correction saved. The submitted values stay on the log.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the correction.");
    } finally {
      setBusy(false);
    }
  }

  async function send(invoiceId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendInvoice(invoiceId);
      setMatches((current) => current.map((item) => (item.id === result.invoice.id ? result.invoice : item)));
      setSelected((current) =>
        current?.invoice?.id === result.invoice.id
          ? {
              ...current,
              invoice: { ...current.invoice, sentToAccountingAt: result.invoice.sentToAccountingAt },
            }
          : current,
      );
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

  async function search() {
    setError(null);
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

  return (
    <section className="card stack">
      <h2>Driver logs</h2>
      <p className="lede">
        This is where office staff review logs drivers submitted for billing. Drafts stay on the driver side until they
        choose Submit log. Stop activity (notes and photos) is under Routes and Stop reports — not here.
      </p>
      <h2>Find an invoice</h2>
      <label htmlFor="invoice-driver">Driver</label>
      <input id="invoice-driver" value={driverQuery} onChange={(event) => setDriverQuery(event.target.value)} />
      <label htmlFor="invoice-date">Service date</label>
      <input id="invoice-date" type="date" value={dateQuery} onChange={(event) => setDateQuery(event.target.value)} />
      <button className="secondary" type="button" onClick={() => void search()}>
        Search
      </button>
      {matches.length > 0 ? (
        <ul className="driver-list">
          {matches.map((invoice) => (
            <li key={invoice.id}>
              <div>
                <strong>
                  {invoice.invoiceNumber} · {invoice.driverName}
                </strong>
                <span>{invoice.serviceDate}</span>
              </div>
              <InvoiceFiles
                invoiceId={invoice.id}
                logId={invoice.logId}
                sentToAccountingAt={invoice.sentToAccountingAt}
                busy={busy}
                onSend={(invoiceId) => void send(invoiceId)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <h2>Submitted logs</h2>
      {logs.length === 0 ? (
        <p className="lede">
          No submitted driver logs yet. Sign in as a driver, open the driver log for a service date, fill it in, and
          choose Submit log — then it appears here for review and invoicing.
        </p>
      ) : null}
      <ul className="driver-list">
        {logs.map((log) => (
          <li key={log.id}>
            <div>
              <strong>
                {log.driverName} · {log.serviceDate}
              </strong>
              <span>{logTypeLabels[log.logType]}</span>
              <span className="badge">{statusLabels[log.status]}</span>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                void readLog(log.id)
                  .then((result) => apply(result.log))
                  .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not open the log."));
              }}
            >
              Open
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="stack">
          <h2>
            {selected.driverName} · {logTypeLabels[selected.logType]}
          </h2>
          <p className="badge">{statusLabels[selected.status]}</p>
          <label htmlFor="review-company">Driver / Company Name</label>
          <input
            id="review-company"
            value={companyName}
            disabled={!editable || busy}
            onChange={(event) => setCompanyName(event.target.value)}
          />
          {submittedValue(selected, null, "driverCompanyName") ? (
            <p className="lede">Submitted: {submittedValue(selected, null, "driverCompanyName")}</p>
          ) : null}
          <label htmlFor="review-paid">{paymentField?.label}</label>
          <input
            id="review-paid"
            type="date"
            value={paymentDate}
            disabled={busy}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
          {paymentField && submittedValue(selected, null, paymentField.key) ? (
            <p className="lede">Submitted: {submittedValue(selected, null, paymentField.key)}</p>
          ) : null}
          {selected.lines.map((line) => (
            <div key={line.id}>
              <p>
                <strong>
                  {line.sequence}. {line.companyName || line.companyNameOrBooking || "Line"} · {line.ticketNumber}
                </strong>
              </p>
              <label htmlFor={`review-price-${line.id}`}>Price</label>
              <input
                id={`review-price-${line.id}`}
                value={prices[line.id] ?? ""}
                disabled={!editable || busy}
                onChange={(event) => setPrices((current) => ({ ...current, [line.id]: event.target.value }))}
              />
              {submittedValue(selected, line.id, "price") ? (
                <p className="lede">Submitted: {submittedValue(selected, line.id, "price")}</p>
              ) : null}
            </div>
          ))}
          {selected.corrections.length > 0 ? (
            <div>
              <h3>Corrections</h3>
              <ul className="history">
                {selected.corrections.map((entry) => (
                  <li key={entry.id}>
                    {entry.fieldKey}: {displayCorrection(entry.fieldKey, entry.previousValue)} →{" "}
                    {displayCorrection(entry.fieldKey, entry.newValue)} · {entry.authorName} ·{" "}
                    {new Date(entry.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className="notice">{notice}</p> : null}
          {selected.invoice ? (
            <InvoiceFiles
              invoiceId={selected.invoice.id}
              logId={selected.id}
              sentToAccountingAt={selected.invoice.sentToAccountingAt}
              busy={busy}
              onSend={(invoiceId) => void send(invoiceId)}
            />
          ) : null}
          {selected.status === "submitted" ? (
            <button className="primary" type="button" disabled={busy} onClick={() => void complete()}>
              Complete log
            </button>
          ) : (
            <button className="primary" type="button" disabled={busy} onClick={() => void saveCorrection()}>
              Save correction
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
