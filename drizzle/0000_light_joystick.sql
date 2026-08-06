CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"watch_record_id" integer NOT NULL,
	"rater_key" text DEFAULT 'me' NOT NULL,
	"rating" integer NOT NULL,
	"short_comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edit_count" integer DEFAULT 0 NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_key" text NOT NULL,
	"content_key" text NOT NULL,
	"content_title" text NOT NULL,
	"content_format" text NOT NULL,
	"content_provider" text,
	"content_runtime" integer,
	"poster_palette" text,
	"watch_mode" text,
	"picked_context" text,
	"picked_mood" text,
	"watch_status" text NOT NULL,
	"started_on" date,
	"finished_on" date,
	"season_number" integer,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_watch_record_id_watch_records_id_fk" FOREIGN KEY ("watch_record_id") REFERENCES "public"."watch_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_record_rater_uniq" ON "reviews" USING btree ("watch_record_id","rater_key");--> statement-breakpoint
CREATE INDEX "watch_records_owner_idx" ON "watch_records" USING btree ("owner_key");--> statement-breakpoint
CREATE INDEX "watch_records_owner_content_idx" ON "watch_records" USING btree ("owner_key","content_key");