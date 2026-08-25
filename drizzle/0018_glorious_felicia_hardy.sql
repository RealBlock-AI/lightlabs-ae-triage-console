CREATE TABLE `account_memberships` (
	`id` varchar(96) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`membership_type` enum('buyer','coman') NOT NULL,
	`status` enum('active','inactive','revoked') NOT NULL DEFAULT 'active',
	`buyer_user_id` int,
	`internal_owner_user_id` int NOT NULL,
	`receive_coman_coas` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `account_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_membership_user_account_unique` UNIQUE(`user_id`,`account_id`),
	CONSTRAINT `account_membership_active_buyer_unique` UNIQUE(`buyer_user_id`)
);
--> statement-breakpoint
UPDATE `users` SET `loginMethod` = 'slack' WHERE `loginMethod` = 'fixture';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` enum('google','slack') NOT NULL DEFAULT 'slack';--> statement-breakpoint
ALTER TABLE `accounts` ADD `owner_user_id` int;--> statement-breakpoint
ALTER TABLE `accounts` ADD `hubspot_portal_id` varchar(64);--> statement-breakpoint
ALTER TABLE `accounts` ADD `hubspot_company_id` varchar(64);--> statement-breakpoint
ALTER TABLE `accounts` ADD `testing_platform_account_id` varchar(64);--> statement-breakpoint
ALTER TABLE `contacts` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `contacts` ADD `internal_owner_user_id` int;--> statement-breakpoint
ALTER TABLE `products` ADD `app_account_id` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `testing_platform_product_id` varchar(64);--> statement-breakpoint
ALTER TABLE `team_members` ADD `user_id` int;--> statement-breakpoint
ALTER TABLE `users` ADD `hubspot_portal_id` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `testing_platform_user_id` varchar(64);--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_hubspot_company_unique` UNIQUE(`hubspot_portal_id`,`hubspot_company_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_testing_platform_unique` UNIQUE(`testing_platform_account_id`);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_testing_platform_unique` UNIQUE(`testing_platform_product_id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_slack_identity_unique` UNIQUE(`slack_workspace_id`,`slack_user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_hubspot_identity_unique` UNIQUE(`hubspot_portal_id`,`hubspot_contact_id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_testing_platform_identity_unique` UNIQUE(`testing_platform_user_id`);--> statement-breakpoint
CREATE INDEX `account_membership_account_idx` ON `account_memberships` (`account_id`,`status`);--> statement-breakpoint
CREATE INDEX `account_membership_owner_idx` ON `account_memberships` (`internal_owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `contacts_user_idx` ON `contacts` (`user_id`);--> statement-breakpoint
CREATE INDEX `contacts_internal_owner_idx` ON `contacts` (`internal_owner_user_id`);--> statement-breakpoint
CREATE INDEX `products_app_account_idx` ON `products` (`app_account_id`);
