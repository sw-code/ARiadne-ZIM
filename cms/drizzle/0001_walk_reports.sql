CREATE TABLE "walk_reports" (
	"install_id" uuid NOT NULL,
	"consent_version" integer NOT NULL,
	"app_version" text NOT NULL,
	"walked_on" date NOT NULL,
	"mode" text NOT NULL,
	"duration_minutes" double precision NOT NULL,
	"median_speed_metres_per_second" double precision,
	"pause_count" integer NOT NULL,
	"ar_tracking_share" double precision NOT NULL,
	"language" text NOT NULL,
	"counts" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "walk_reports_install_id_index" ON "walk_reports" USING btree ("install_id");