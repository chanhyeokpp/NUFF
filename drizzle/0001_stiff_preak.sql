CREATE TABLE `capture_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_until` integer,
	`lease_token` text,
	`last_error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_capture_owner_url` ON `capture_jobs` (`owner`,`url`);--> statement-breakpoint
CREATE INDEX `idx_capture_queue` ON `capture_jobs` (`status`,`available_at`);