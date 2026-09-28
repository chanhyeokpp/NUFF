ALTER TABLE `email_credentials` ADD COLUMN `verified_at` text;
--> statement-breakpoint
UPDATE `email_credentials` SET `verified_at`=`created_at` WHERE `verified_at` IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_email_verification_user` ON `email_verification_codes` (`user_id`,`created_at`);
