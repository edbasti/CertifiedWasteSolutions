ALTER TABLE "stops" ADD COLUMN "service_type" text DEFAULT 'remove' NOT NULL;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "driver_notes" text DEFAULT '' NOT NULL;