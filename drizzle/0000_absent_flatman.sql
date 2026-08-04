CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_record_id` integer NOT NULL,
	`rater_key` text DEFAULT 'me' NOT NULL,
	`rating` integer NOT NULL,
	`short_comment` text,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`edit_count` integer DEFAULT 0 NOT NULL,
	`edited_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`watch_record_id`) REFERENCES `watch_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_record_rater_uniq` ON `reviews` (`watch_record_id`,`rater_key`);--> statement-breakpoint
CREATE TABLE `watch_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`content_key` text NOT NULL,
	`content_title` text NOT NULL,
	`content_format` text NOT NULL,
	`content_provider` text,
	`content_runtime` integer,
	`poster_palette` text,
	`watch_mode` text,
	`picked_context` text,
	`picked_mood` text,
	`watch_status` text NOT NULL,
	`started_on` text,
	`finished_on` text,
	`season_number` integer,
	`memo` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watch_records_owner_idx` ON `watch_records` (`owner_key`);--> statement-breakpoint
CREATE INDEX `watch_records_owner_content_idx` ON `watch_records` (`owner_key`,`content_key`);