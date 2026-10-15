export const appName = "Certified Waste Solutions";

export {
  fieldOwners,
  fieldScopes,
  fieldValueTypes,
  logStatuses,
  logTypeLabels,
  logTypes,
  notificationTypes,
  routeSources,
  stopStatuses,
  homePath,
  userRoles,
} from "./operations";
export type {
  AppNotification,
  AssignedRoute,
  AssignedStop,
  CompletedStop,
  CompletedStopReport,
  CustomerAccount,
  DispatchDriverMatch,
  DispatchImportPreview,
  DispatchImportRow,
  DriverAccount,
  DriverDay,
  DriverLog,
  DriverLogLine,
  LogCorrection,
  LogSummary,
  DriverStatusChange,
  DriverStop,
  DriverStopNote,
  DriverStopPhoto,
  ImportResult,
  InvoiceRecord,
  RouteImportResult,
  StopSourceInfo,
  FieldOwner,
  FieldScope,
  FieldValueType,
  LogStatus,
  LogType,
  NetSuiteConnection,
  NetSuiteCredentialSlot,
  NetSuiteSearchColumn,
  NotificationType,
  PublicUser,
  RouteSource,
  StatusDurationAverage,
  StopStatus,
  UserRole,
} from "./operations";
export { invoiceSources, logFieldMap } from "./log-fields";
export type { LogField } from "./log-fields";

/** Colors from the Certified Waste Solutions brand guide. */
export const brand = {
  spaceBlue: "#012556",
  forestGreen: "#519F44",
  sable: "#242424",
  joustBlue1: "#51AAFA",
  joustBlue2: "#188EF4",
  joustBlue3: "#3B7CB7",
  silverfish: "#8D97AD",
  crystal: "#EFEFEF",
  /** Soft page canvas used by the operations UI (derived from Crystal). */
  canvas: "#F4F7FB",
  /** Soft Forest Green wash for status chips and highlights. */
  forestSoft: "#E8F4E4",
  /** Soft Joust Blue wash for in-progress status. */
  joustSoft: "#E5F2FE",
  /** Attention amber used sparingly for warnings. */
  amber: "#BC7314",
  amberSoft: "#FFF2D9",
} as const;
