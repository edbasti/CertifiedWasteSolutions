export const userRoles = ["admin", "manager", "driver"] as const;
export type UserRole = (typeof userRoles)[number];

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string | null;
};

export type DriverAccount = {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  active: boolean;
};

export type CustomerAccount = {
  id: string;
  name: string;
  address: string;
  active: boolean;
};

export type ImportResult = {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
};

export type AssignedStop = {
  id: string;
  sequence: number;
  customerId: string | null;
  customerName: string;
  address: string;
  pickupDescription: string;
  status: StopStatus;
  notes: DriverStopNote[];
  photos: DriverStopPhoto[];
  history: DriverStatusChange[];
};

export type AssignedRoute = {
  id: string;
  driverUserId: string;
  driverName: string;
  serviceDate: string;
  source: RouteSource;
  stops: AssignedStop[];
};

export type RouteImportResult = {
  createdRoutes: number;
  replacedRoutes: number;
  stops: number;
  errors: { line: number; message: string }[];
};

export type StopSourceInfo = {
  id: RouteSource;
  label: string;
  available: boolean;
  detail?: string;
};

export type DriverStopNote = {
  id: string;
  body: string;
  createdAt: string;
  authorName?: string;
};

export type DriverStopPhoto = {
  id: string;
  createdAt: string;
};

export type DriverStatusChange = {
  id: string;
  fromStatus: StopStatus | null;
  toStatus: StopStatus;
  changedAt: string;
  changedByName?: string;
};

export type DriverStop = {
  id: string;
  sequence: number;
  customerName: string;
  address: string;
  pickupDescription: string;
  status: StopStatus;
  notes: DriverStopNote[];
  photos: DriverStopPhoto[];
  history: DriverStatusChange[];
};

export type StatusDurationAverage = {
  fromStatus: StopStatus;
  toStatus: StopStatus;
  averageMinutes: number;
  samples: number;
};

export type CompletedStop = {
  id: string;
  sequence: number;
  serviceDate: string;
  driverName: string;
  customerName: string;
  address: string;
  pickupDescription: string;
  notes: DriverStopNote[];
  photos: DriverStopPhoto[];
  history: DriverStatusChange[];
};

export type CompletedStopReport = {
  stops: CompletedStop[];
  averages: StatusDurationAverage[];
};

export type DriverDay = {
  date: string;
  routeId: string | null;
  stops: DriverStop[];
};

export function homePath(role: UserRole): "/day" | "/portal" {
  return role === "driver" ? "/day" : "/portal";
}

export const notificationTypes = ["route_assigned", "route_updated"] as const;
export type NotificationType = (typeof notificationTypes)[number];

export type AppNotification = {
  id: string;
  type: NotificationType;
  message: string;
  serviceDate: string;
  routeDayId: string | null;
  readAt: string | null;
  createdAt: string;
};

export const stopStatuses = ["not_started", "en_route", "completed"] as const;
export type StopStatus = (typeof stopStatuses)[number];

export const routeSources = ["csv", "netsuite", "manual"] as const;
export type RouteSource = (typeof routeSources)[number];

export type NetSuiteCredentialSlot = {
  key: string;
  label: string;
  configured: boolean;
};

export type NetSuiteSearchColumn = {
  field: string;
  label: string;
  column: string;
  required: boolean;
};

export type NetSuiteConnection = {
  connected: false;
  mode: "csv";
  message: "CSV only, NetSuite not connected.";
  credentials: NetSuiteCredentialSlot[];
  savedSearch: {
    id: string;
    columns: NetSuiteSearchColumn[];
  };
};

export const logTypes = ["port", "non_port"] as const;
export type LogType = (typeof logTypes)[number];

export const logStatuses = [
  "draft",
  "submitted",
  "manager_review",
  "invoiced",
  "corrected",
] as const;
export type LogStatus = (typeof logStatuses)[number];

export const logTypeLabels: Record<LogType, string> = {
  port: "Independent Driver Log",
  non_port: "Independent Driver Log (Non-Port)",
};

export type DriverLogLine = {
  id: string;
  sequence: number;
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
  priceCents: number | null;
};

export type LogCorrection = {
  id: string;
  lineId: string | null;
  fieldKey: string;
  previousValue: string | null;
  newValue: string | null;
  authorName: string;
  createdAt: string;
};

export type DriverLog = {
  id: string;
  driverName: string;
  logType: LogType;
  serviceDate: string;
  status: LogStatus;
  driverCompanyName: string;
  datePaid: string | null;
  paymentDateFriday: string | null;
  submittedAt: string | null;
  lines: DriverLogLine[];
  corrections: LogCorrection[];
  invoice: { id: string; invoiceNumber: string; sentToAccountingAt: string | null } | null;
};

export type InvoiceRecord = {
  id: string;
  logId: string;
  invoiceNumber: string;
  driverName: string;
  serviceDate: string;
  logType: LogType;
  priceTotalCents: number;
  createdAt: string;
  sentToAccountingAt: string | null;
};

export type LogSummary = {
  id: string;
  driverName: string;
  serviceDate: string;
  logType: LogType;
  status: LogStatus;
  driverCompanyName: string;
};

export const fieldOwners = ["driver", "manager"] as const;
export type FieldOwner = (typeof fieldOwners)[number];

export const fieldScopes = ["header", "line"] as const;
export type FieldScope = (typeof fieldScopes)[number];

export const fieldValueTypes = ["text", "date", "money", "boolean"] as const;
export type FieldValueType = (typeof fieldValueTypes)[number];
