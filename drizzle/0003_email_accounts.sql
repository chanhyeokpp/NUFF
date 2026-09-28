CREATE TABLE IF NOT EXISTS `email_credentials` (
	`user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`iterations` integer NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_email_credentials_email` ON `email_credentials` (`email`);
