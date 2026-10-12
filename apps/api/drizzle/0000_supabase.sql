CREATE TABLE "corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"line_id" text,
	"field_key" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"author_user_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_user_id" text NOT NULL,
	"route_day_id" text,
	"log_type" text NOT NULL,
	"service_date" text NOT NULL,
	"status" text NOT NULL,
	"driver_company_name" text NOT NULL,
	"date_paid" text,
	"payment_date_friday" text,
	"submitted_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"pdf_path" text,
	"created_at" text NOT NULL,
	"sent_to_accounting_at" text,
	CONSTRAINT "invoices_log_id_unique" UNIQUE("log_id"),
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "log_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"ticket_date" text,
	"company_name" text,
	"company_name_or_booking" text,
	"multi_stop_load" boolean DEFAULT false NOT NULL,
	"ticket_number" text,
	"terminal_empty_out" text,
	"chassis_number" text,
	"container_number" text,
	"terminal_load_in" text,
	"comments" text,
	"price_cents" integer
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"read_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_days" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_user_id" text NOT NULL,
	"service_date" text NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_events" (
	"id" text PRIMARY KEY NOT NULL,
	"stop_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_at" text NOT NULL,
	"changed_by_user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stop_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"stop_id" text NOT NULL,
	"body" text NOT NULL,
	"author_user_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stop_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"stop_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"author_user_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" text PRIMARY KEY NOT NULL,
	"route_day_id" text NOT NULL,
	"customer_id" text,
	"sequence" integer NOT NULL,
	"customer_name" text NOT NULL,
	"address" text NOT NULL,
	"pickup_description" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"company_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_log_id_driver_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."driver_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_line_id_log_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."log_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_logs" ADD CONSTRAINT "driver_logs_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_logs" ADD CONSTRAINT "driver_logs_route_day_id_route_days_id_fk" FOREIGN KEY ("route_day_id") REFERENCES "public"."route_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_log_id_driver_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."driver_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_lines" ADD CONSTRAINT "log_lines_log_id_driver_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."driver_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_days" ADD CONSTRAINT "route_days_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_notes" ADD CONSTRAINT "stop_notes_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_notes" ADD CONSTRAINT "stop_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_photos" ADD CONSTRAINT "stop_photos_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_photos" ADD CONSTRAINT "stop_photos_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_route_day_id_route_days_id_fk" FOREIGN KEY ("route_day_id") REFERENCES "public"."route_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "log_lines_log_sequence" ON "log_lines" USING btree ("log_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "route_days_driver_date" ON "route_days" USING btree ("driver_user_id","service_date");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stops_route_sequence" ON "stops" USING btree ("route_day_id","sequence");