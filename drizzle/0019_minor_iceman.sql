ALTER TABLE `account_memberships` MODIFY COLUMN `status` enum('pending','active','inactive','revoked') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `users` ADD `identity_status` enum('pending','verified','revoked') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `verified_at` datetime;