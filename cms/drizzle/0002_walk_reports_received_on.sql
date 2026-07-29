ALTER TABLE "walk_reports" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "walk_reports" ADD COLUMN "received_on" date DEFAULT current_date NOT NULL;--> statement-breakpoint
CREATE INDEX "walk_reports_received_on_index" ON "walk_reports" USING btree ("received_on");--> statement-breakpoint
ALTER TABLE "walk_reports" DROP COLUMN "received_at";