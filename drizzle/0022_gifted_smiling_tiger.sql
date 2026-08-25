CREATE TABLE `account_relationships` (
	`id` varchar(96) NOT NULL,
	`coman_account_id` varchar(64) NOT NULL,
	`brand_account_id` varchar(64) NOT NULL,
	`relationship_type` enum('coman_brand') NOT NULL DEFAULT 'coman_brand',
	`active` int NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `account_relationships_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_relationship_pair_unique` UNIQUE(`coman_account_id`,`brand_account_id`)
);
--> statement-breakpoint
CREATE TABLE `coman_contact_brand_access` (
	`id` varchar(96) NOT NULL,
	`contact_id` varchar(64) NOT NULL,
	`coman_account_id` varchar(64) NOT NULL,
	`brand_account_id` varchar(64) NOT NULL,
	`can_view` int NOT NULL DEFAULT 1,
	`can_edit` int NOT NULL DEFAULT 0,
	`approval_scope` enum('none','view','edit') NOT NULL DEFAULT 'view',
	`active` int NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `coman_contact_brand_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `coman_contact_brand_access_unique` UNIQUE(`contact_id`,`brand_account_id`)
);
--> statement-breakpoint
CREATE TABLE `demo_support_field_definitions` (
	`id` varchar(96) NOT NULL,
	`source_system` enum('hubspot','platform','support') NOT NULL DEFAULT 'support',
	`object_type` varchar(80) NOT NULL,
	`field_key` varchar(160) NOT NULL,
	`label` varchar(200) NOT NULL,
	`definition` mediumtext NOT NULL,
	`data_type` enum('text','number','date','url','boolean','json') NOT NULL DEFAULT 'text',
	`searchable` int NOT NULL DEFAULT 0,
	`writable` int NOT NULL DEFAULT 0,
	`displayed_by_default` int NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `demo_support_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `demo_support_field_unique` UNIQUE(`object_type`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `demo_testing_platform_field_definitions` (
	`id` varchar(96) NOT NULL,
	`source_system` enum('hubspot','platform','support') NOT NULL DEFAULT 'platform',
	`object_type` varchar(80) NOT NULL,
	`field_key` varchar(160) NOT NULL,
	`label` varchar(200) NOT NULL,
	`definition` mediumtext NOT NULL,
	`data_type` enum('text','number','date','url','boolean','json') NOT NULL DEFAULT 'text',
	`searchable` int NOT NULL DEFAULT 0,
	`writable` int NOT NULL DEFAULT 0,
	`displayed_by_default` int NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `demo_testing_platform_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `demo_platform_field_unique` UNIQUE(`object_type`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `support_owners` (
	`id` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('ae','am') NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `support_owners_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_owners_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `demo_hubspot_field_definitions` ADD `source_system` enum('hubspot','platform','support') DEFAULT 'hubspot' NOT NULL;--> statement-breakpoint
ALTER TABLE `demo_hubspot_field_definitions` ADD `definition` mediumtext NULL;--> statement-breakpoint
UPDATE `demo_hubspot_field_definitions` SET `definition` = 'Legacy field definition. The demo catalog seed will refresh this record with source-specific guidance.' WHERE `definition` IS NULL;--> statement-breakpoint
ALTER TABLE `demo_hubspot_field_definitions` MODIFY COLUMN `definition` mediumtext NOT NULL;--> statement-breakpoint
CREATE INDEX `account_relationship_coman_idx` ON `account_relationships` (`coman_account_id`,`active`);--> statement-breakpoint
CREATE INDEX `account_relationship_brand_idx` ON `account_relationships` (`brand_account_id`,`active`);--> statement-breakpoint
CREATE INDEX `coman_contact_brand_access_coman_idx` ON `coman_contact_brand_access` (`coman_account_id`,`active`);--> statement-breakpoint
CREATE INDEX `coman_contact_brand_access_brand_idx` ON `coman_contact_brand_access` (`brand_account_id`,`active`);--> statement-breakpoint
CREATE INDEX `demo_support_field_search_idx` ON `demo_support_field_definitions` (`object_type`,`searchable`);--> statement-breakpoint
CREATE INDEX `demo_platform_field_search_idx` ON `demo_testing_platform_field_definitions` (`object_type`,`searchable`);--> statement-breakpoint
CREATE INDEX `support_owners_active_idx` ON `support_owners` (`active`,`name`);
