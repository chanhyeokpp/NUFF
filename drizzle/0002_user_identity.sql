CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`,`created_at`)
SELECT `owner`, MIN(`created_at`) FROM (
	SELECT `owner`,`created_at` FROM `capture_jobs`
	UNION ALL SELECT `owner`,`created_at` FROM `contents`
	UNION ALL SELECT `owner`,`created_at` FROM `events`
) GROUP BY `owner`;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_identity_provider_subject` ON `user_identities` (`provider`,`provider_subject`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_identity_user` ON `user_identities` (`user_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `user_identities` (`id`,`user_id`,`provider`,`provider_subject`,`created_at`)
SELECT lower(hex(randomblob(16))),`id`,'kakao',`id`,`created_at` FROM `users` WHERE `id` LIKE 'kakao:%';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pairing_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pairing_expiry` ON `pairing_codes` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `device_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_device_token_hash` ON `device_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_device_user` ON `device_tokens` (`user_id`);
