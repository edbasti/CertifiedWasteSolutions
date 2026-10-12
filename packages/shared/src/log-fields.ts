import type { FieldOwner, FieldScope, FieldValueType, LogType } from "./operations";

export type LogField = {
  key: string;
  label: string;
  scope: FieldScope;
  filledBy: FieldOwner;
  /** Included when the invoice is built from a completed log. */
  onInvoice: boolean;
  valueType: FieldValueType;
};

const driverCompanyName: LogField = {
  key: "driverCompanyName",
  label: "Driver / Company Name",
  scope: "header",
  filledBy: "driver",
  onInvoice: true,
  valueType: "text",
};

const ticketDate: LogField = {
  key: "ticketDate",
  label: "Date Printed on Certified Recycling Weight Ticket",
  scope: "line",
  filledBy: "driver",
  onInvoice: true,
  valueType: "date",
};

const multiStopLoad: LogField = {
  key: "multiStopLoad",
  label: "Multi-Stop Load (X)",
  scope: "line",
  filledBy: "driver",
  onInvoice: true,
  valueType: "boolean",
};

const ticketNumber: LogField = {
  key: "ticketNumber",
  label: "Ticket Number (Certified)",
  scope: "line",
  filledBy: "driver",
  onInvoice: true,
  valueType: "text",
};

const price: LogField = {
  key: "price",
  label: "Price",
  scope: "line",
  filledBy: "driver",
  onInvoice: true,
  valueType: "money",
};

function line(key: string, label: string, valueType: FieldValueType = "text"): LogField {
  return {
    key,
    label,
    scope: "line",
    filledBy: "driver",
    onInvoice: true,
    valueType,
  };
}

export const logFieldMap: Record<LogType, readonly LogField[]> = {
  non_port: [
    driverCompanyName,
    {
      key: "datePaid",
      label: "Date Paid",
      scope: "header",
      filledBy: "manager",
      onInvoice: false,
      valueType: "date",
    },
    ticketDate,
    line("companyName", "Company Name"),
    multiStopLoad,
    ticketNumber,
    price,
  ],
  port: [
    driverCompanyName,
    {
      key: "paymentDateFriday",
      label: "Payment Date (Friday)",
      scope: "header",
      filledBy: "manager",
      onInvoice: false,
      valueType: "date",
    },
    ticketDate,
    ticketNumber,
    multiStopLoad,
    line("companyNameOrBooking", "Company Name / Booking Number"),
    line("terminalEmptyOut", "Terminal Empty Out"),
    line("chassisNumber", "Chassis Number"),
    line("containerNumber", "Container Number"),
    line("terminalLoadIn", "Terminal Load In"),
    line("comments", "Comments"),
    price,
  ],
};

/** What the invoice is allowed to read until the real template arrives. */
export const invoiceSources = [
  "driverName",
  "logType",
  "serviceDate",
  "lines",
  "priceTotal",
] as const;
