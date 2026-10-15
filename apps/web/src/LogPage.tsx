import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { logFieldMap, logTypeLabels, logTypes, type DriverLog, type LogField, type LogType } from "@cws/shared";
import { ApiError, loadLog, saveLog, submitLog } from "./api";
import { useSession } from "./session";
import "./log.css";

type FormLine = {
  ticketDate: string;
  companyName: string;
  companyNameOrBooking: string;
  multiStopLoad: boolean;
  ticketNumber: string;
  terminalEmptyOut: string;
  chassisNumber: string;
  containerNumber: string;
  terminalLoadIn: string;
  comments: string;
  price: string;
};

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function blankLine(): FormLine {
  return {
    ticketDate: "",
    companyName: "",
    companyNameOrBooking: "",
    multiStopLoad: false,
    ticketNumber: "",
    terminalEmptyOut: "",
    chassisNumber: "",
    containerNumber: "",
    terminalLoadIn: "",
    comments: "",
    price: "",
  };
}

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

function fromLog(log: DriverLog): FormLine[] {
  if (log.lines.length === 0) {
    return [blankLine()];
  }
  return log.lines.map((line) => ({
    ticketDate: line.ticketDate,
    companyName: line.companyName,
    companyNameOrBooking: line.companyNameOrBooking,
    multiStopLoad: line.multiStopLoad,
    ticketNumber: line.ticketNumber,
    terminalEmptyOut: line.terminalEmptyOut,
    chassisNumber: line.chassisNumber,
    containerNumber: line.containerNumber,
    terminalLoadIn: line.terminalLoadIn,
    comments: line.comments,
    price: dollars(line.priceCents),
  }));
}

function lineValue(line: FormLine, field: LogField): string {
  if (field.key === "price") {
    return line.price;
  }
  const value = line[field.key as keyof FormLine];
  return typeof value === "string" ? value : "";
}

function withLineValue(line: FormLine, field: LogField, value: string | boolean): FormLine {
  if (field.key === "price" && typeof value === "string") {
    return { ...line, price: value };
  }
  if (field.key === "multiStopLoad" && typeof value === "boolean") {
    return { ...line, multiStopLoad: value };
  }
  if (field.key in line && typeof value === "string") {
    return { ...line, [field.key]: value };
  }
  return line;
}

export function LogPage() {
  const { user, logout } = useSession();
  const [params, setParams] = useSearchParams();
  const queryDate = params.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : localDate();
  const [record, setRecord] = useState<DriverLog | null>(null);
  const [logType, setLogType] = useState<LogType>("non_port");
  const [companyName, setCompanyName] = useState(user?.companyName || user?.name || "");
  const [lines, setLines] = useState<FormLine[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = record !== null && record.status !== "draft";
  const headerFields = logFieldMap[logType].filter((field) => field.scope === "header");
  const fields = logFieldMap[logType].filter((field) => field.scope === "line");

  useEffect(() => {
    let active = true;
    loadLog(date)
      .then((result) => {
        if (!active) {
          return;
        }
        setRecord(result.log);
        setError(null);
        if (result.log) {
          setLogType(result.log.logType);
          setCompanyName(result.log.driverCompanyName);
          setLines(fromLog(result.log));
        } else {
          setLogType("non_port");
          setCompanyName(user?.companyName || user?.name || "");
          setLines([blankLine()]);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : "Could not load the log.");
        }
      });
    return () => {
      active = false;
    };
  }, [date, user?.companyName, user?.name]);

  function chooseType(next: LogType) {
    setLogType(next);
    setLines((current) =>
      current.map((line) => ({
        ...blankLine(),
        ticketDate: line.ticketDate,
        multiStopLoad: line.multiStopLoad,
        ticketNumber: line.ticketNumber,
        price: line.price,
      })),
    );
  }

  function payload() {
    return {
      serviceDate: date,
      logType,
      driverCompanyName: companyName,
      lines: lines.map((line) => ({
        ticketDate: line.ticketDate,
        companyName: line.companyName,
        companyNameOrBooking: line.companyNameOrBooking,
        multiStopLoad: line.multiStopLoad,
        ticketNumber: line.ticketNumber,
        terminalEmptyOut: line.terminalEmptyOut,
        chassisNumber: line.chassisNumber,
        containerNumber: line.containerNumber,
        terminalLoadIn: line.terminalLoadIn,
        comments: line.comments,
        priceCents: cents(line.price),
      })),
    };
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveLog(payload());
      setRecord(result.log);
      setLines(fromLog(result.log));
      setNotice("Draft saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveLog(payload());
      const result = await submitLog(saved.log.id);
      setRecord(result.log);
      setLines(fromLog(result.log));
      setNotice("Submitted. A manager completes the payment date.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the log.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-shell">
      <header className="field-topbar">
        <div>
          <p className="eyebrow">Driver</p>
          <h1>Driver log</h1>
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
      <main className="content log">
        <div className="page-heading">
          <div>
            <p className="eyebrow">End of day</p>
            <h2>Driver log</h2>
            <p className="lede">Fill ticket lines, then submit when the day is complete.</p>
          </div>
          <Link className="secondary" to={`/day?date=${date}`}>
            ← Back to stops
          </Link>
        </div>
        <label htmlFor="log-date">Service date</label>
        <input
          id="log-date"
          type="date"
          value={date}
          onChange={(event) => {
            setNotice(null);
            setParams({ date: event.target.value });
          }}
        />
        <label htmlFor="log-type">Log type</label>
        <select
          id="log-type"
          value={logType}
          disabled={locked}
          onChange={(event) => chooseType(event.target.value as LogType)}
        >
          {logTypes.map((type) => (
            <option key={type} value={type}>
              {logTypeLabels[type]}
            </option>
          ))}
        </select>
        <p className="badge">{locked ? "Submitted" : "Draft"}</p>
        {headerFields.map((field) =>
          field.filledBy === "driver" ? (
            <div key={field.key}>
              <label htmlFor="log-company">{field.label}</label>
              <input
                id="log-company"
                value={companyName}
                disabled={locked}
                onChange={(event) => setCompanyName(event.target.value)}
              />
            </div>
          ) : (
            <div key={field.key}>
              <label htmlFor={`log-${field.key}`}>{field.label}</label>
              <input
                id={`log-${field.key}`}
                value={field.key === "datePaid" ? (record?.datePaid ?? "") : (record?.paymentDateFriday ?? "")}
                disabled
              />
              <p className="lede">The manager fills this after you submit.</p>
            </div>
          ),
        )}
        {lines.map((line, index) => (
          <section className="card stack" key={index}>
            <h2>Line {index + 1}</h2>
            {fields.map((field) => (
              <div key={field.key}>
                {field.valueType === "boolean" ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={line.multiStopLoad}
                      disabled={locked}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? withLineValue(item, field, event.target.checked) : item,
                          ),
                        )
                      }
                    />
                    {field.label}
                  </label>
                ) : (
                  <>
                    <label htmlFor={`line-${index}-${field.key}`}>{field.label}</label>
                    {field.key === "comments" ? (
                      <textarea
                        id={`line-${index}-${field.key}`}
                        value={lineValue(line, field)}
                        disabled={locked}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? withLineValue(item, field, event.target.value) : item,
                            ),
                          )
                        }
                      />
                    ) : (
                      <input
                        id={`line-${index}-${field.key}`}
                        type={field.valueType === "date" ? "date" : "text"}
                        inputMode={field.valueType === "money" ? "decimal" : undefined}
                        value={lineValue(line, field)}
                        disabled={locked}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? withLineValue(item, field, event.target.value) : item,
                            ),
                          )
                        }
                      />
                    )}
                  </>
                )}
              </div>
            ))}
            {locked || lines.length === 1 ? null : (
              <button
                className="secondary"
                type="button"
                onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                Remove line
              </button>
            )}
          </section>
        ))}
        {record && record.corrections.length > 0 ? (
          <section className="card stack">
            <h2>Corrections</h2>
            <ul className="history">
              {record.corrections.map((entry) => (
                <li key={entry.id}>
                  {entry.fieldKey}: {entry.previousValue ?? "blank"} → {entry.newValue ?? "blank"} · {entry.authorName}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="notice">{notice}</p> : null}
        {locked ? null : (
          <div className="row-actions">
            <button className="secondary" type="button" disabled={busy} onClick={() => setLines((current) => [...current, blankLine()])}>
              Add line
            </button>
            <button className="secondary" type="button" disabled={busy} onClick={() => void saveDraft()}>
              Save draft
            </button>
            <button className="primary" type="button" disabled={busy} onClick={() => void submit()}>
              Submit log
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
