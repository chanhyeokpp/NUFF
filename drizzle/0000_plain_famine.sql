CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`url` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`viewed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contents_owner_url` ON `contents` (`owner`,`url`);--> statement-breakpoint
CREATE INDEX `idx_contents_owner_created` ON `contents` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text,
	`created_at` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `idx_events_owner_created` ON `events` (`owner`,`created_at`);