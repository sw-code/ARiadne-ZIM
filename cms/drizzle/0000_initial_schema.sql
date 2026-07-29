CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotations_valid_range" CHECK ("annotations"."valid_to" >= "annotations"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"subtype" text NOT NULL,
	"name" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"tags" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"gone_since" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;