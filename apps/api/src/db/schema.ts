import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "manager", "driver"] }).notNull(),
  companyName: text("company_name"),
  active: boolean("active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("sessions_user").on(table.userId)],
);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const routeDays = pgTable(
  "route_days",
  {
    id: text("id").primaryKey(),
    driverUserId: text("driver_user_id")
      .notNull()
      .references(() => users.id),
    serviceDate: text("service_date").notNull(),
    source: text("source", { enum: ["csv", "netsuite", "manual"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("route_days_driver_date").on(table.driverUserId, table.serviceDate)],
);

export const stops = pgTable(
  "stops",
  {
    id: text("id").primaryKey(),
    routeDayId: text("route_day_id")
      .notNull()
      .references(() => routeDays.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customers.id),
    sequence: integer("sequence").notNull(),
    customerName: text("customer_name").notNull(),
    address: text("address").notNull(),
    pickupDescription: text("pickup_description").notNull(),
    status: text("status", { enum: ["not_started", "en_route", "completed"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("stops_route_sequence").on(table.routeDayId, table.sequence)],
);

export const statusEvents = pgTable("status_events", {
  id: text("id").primaryKey(),
  stopId: text("stop_id")
    .notNull()
    .references(() => stops.id, { onDelete: "cascade" }),
  fromStatus: text("from_status", { enum: ["not_started", "en_route", "completed"] }),
  toStatus: text("to_status", { enum: ["not_started", "en_route", "completed"] }).notNull(),
  changedAt: text("changed_at").notNull(),
  changedByUserId: text("changed_by_user_id")
    .notNull()
    .references(() => users.id),
});

export const stopNotes = pgTable("stop_notes", {
  id: text("id").primaryKey(),
  stopId: text("stop_id")
    .notNull()
    .references(() => stops.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const stopPhotos = pgTable("stop_photos", {
  id: text("id").primaryKey(),
  stopId: text("stop_id")
    .notNull()
    .references(() => stops.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
});

export const driverLogs = pgTable("driver_logs", {
  id: text("id").primaryKey(),
  driverUserId: text("driver_user_id")
    .notNull()
    .references(() => users.id),
  routeDayId: text("route_day_id").references(() => routeDays.id),
  logType: text("log_type", { enum: ["port", "non_port"] }).notNull(),
  serviceDate: text("service_date").notNull(),
  status: text("status", {
    enum: ["draft", "submitted", "manager_review", "invoiced", "corrected"],
  }).notNull(),
  driverCompanyName: text("driver_company_name").notNull(),
  datePaid: text("date_paid"),
  paymentDateFriday: text("payment_date_friday"),
  submittedAt: text("submitted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Line columns cover both paper forms. Unused columns stay null for the other form. Money is integer cents. */
export const logLines = pgTable(
  "log_lines",
  {
    id: text("id").primaryKey(),
    logId: text("log_id")
      .notNull()
      .references(() => driverLogs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    ticketDate: text("ticket_date"),
    companyName: text("company_name"),
    companyNameOrBooking: text("company_name_or_booking"),
    multiStopLoad: boolean("multi_stop_load").notNull().default(false),
    ticketNumber: text("ticket_number"),
    terminalEmptyOut: text("terminal_empty_out"),
    chassisNumber: text("chassis_number"),
    containerNumber: text("container_number"),
    terminalLoadIn: text("terminal_load_in"),
    comments: text("comments"),
    priceCents: integer("price_cents"),
  },
  (table) => [uniqueIndex("log_lines_log_sequence").on(table.logId, table.sequence)],
);

export const corrections = pgTable("corrections", {
  id: text("id").primaryKey(),
  logId: text("log_id")
    .notNull()
    .references(() => driverLogs.id, { onDelete: "cascade" }),
  lineId: text("line_id").references(() => logLines.id),
  fieldKey: text("field_key").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  logId: text("log_id")
    .notNull()
    .unique()
    .references(() => driverLogs.id),
  invoiceNumber: text("invoice_number").notNull().unique(),
  pdfPath: text("pdf_path"),
  createdAt: text("created_at").notNull(),
  sentToAccountingAt: text("sent_to_accounting_at"),
});

export const usersRelations = relations(users, ({ many }) => ({
  routeDays: many(routeDays),
}));

export const routeDaysRelations = relations(routeDays, ({ one, many }) => ({
  driver: one(users, { fields: [routeDays.driverUserId], references: [users.id] }),
  stops: many(stops),
  logs: many(driverLogs),
}));

export const stopsRelations = relations(stops, ({ one, many }) => ({
  routeDay: one(routeDays, { fields: [stops.routeDayId], references: [routeDays.id] }),
  customer: one(customers, { fields: [stops.customerId], references: [customers.id] }),
  statusEvents: many(statusEvents),
  notes: many(stopNotes),
  photos: many(stopPhotos),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  stops: many(stops),
}));

export const statusEventsRelations = relations(statusEvents, ({ one }) => ({
  stop: one(stops, { fields: [statusEvents.stopId], references: [stops.id] }),
}));

export const stopNotesRelations = relations(stopNotes, ({ one }) => ({
  stop: one(stops, { fields: [stopNotes.stopId], references: [stops.id] }),
}));

export const stopPhotosRelations = relations(stopPhotos, ({ one }) => ({
  stop: one(stops, { fields: [stopPhotos.stopId], references: [stops.id] }),
}));

export const driverLogsRelations = relations(driverLogs, ({ one, many }) => ({
  driver: one(users, { fields: [driverLogs.driverUserId], references: [users.id] }),
  routeDay: one(routeDays, { fields: [driverLogs.routeDayId], references: [routeDays.id] }),
  lines: many(logLines),
  corrections: many(corrections),
  invoice: one(invoices, { fields: [driverLogs.id], references: [invoices.logId] }),
}));

export const logLinesRelations = relations(logLines, ({ one }) => ({
  log: one(driverLogs, { fields: [logLines.logId], references: [driverLogs.id] }),
}));

export const correctionsRelations = relations(corrections, ({ one }) => ({
  log: one(driverLogs, { fields: [corrections.logId], references: [driverLogs.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  log: one(driverLogs, { fields: [invoices.logId], references: [driverLogs.id] }),
}));
