CREATE TABLE `demo_hubspot_access_policies` (
	`id` varchar(96) NOT NULL,
	`role` enum('admin','user','read_only') NOT NULL,
	`object_type` enum('companies','contacts','deals') NOT NULL,
	`field_key` varchar(160) NOT NULL,
	`can_read` int NOT NULL DEFAULT 0,
	`can_write` int NOT NULL DEFAULT 0,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `demo_hubspot_access_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `demo_hubspot_policy_unique` UNIQUE(`role`,`object_type`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `demo_hubspot_companies` (
	`id` varchar(64) NOT NULL,
	`account_id` varchar(64),
	`properties` json NOT NULL,
	`normalized_name` varchar(240) NOT NULL,
	`normalized_domain` varchar(240),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `demo_hubspot_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `demo_hubspot_contacts` (
	`id` varchar(64) NOT NULL,
	`company_id` varchar(64),
	`account_id` varchar(64),
	`properties` json NOT NULL,
	`normalized_name` varchar(240) NOT NULL,
	`normalized_email` varchar(320),
	`normalized_company` varchar(240),
	`slack_id` varchar(120),
	`slack_team_id` varchar(64),
	`verification_status` enum('unverified','verified','revoked') NOT NULL DEFAULT 'unverified',
	`verified_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `demo_hubspot_contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `demo_hubspot_contact_slack_unique` UNIQUE(`slack_team_id`,`slack_id`)
);
--> statement-breakpoint
CREATE TABLE `demo_hubspot_deals` (
	`id` varchar(64) NOT NULL,
	`company_id` varchar(64),
	`account_id` varchar(64),
	`contact_id` varchar(64),
	`properties` json NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `demo_hubspot_deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `demo_hubspot_field_definitions` (
	`id` varchar(96) NOT NULL,
	`object_type` enum('companies','contacts','deals') NOT NULL,
	`field_key` varchar(160) NOT NULL,
	`label` varchar(200) NOT NULL,
	`data_type` enum('text','number','date','url','boolean') NOT NULL DEFAULT 'text',
	`searchable` int NOT NULL DEFAULT 0,
	`writable` int NOT NULL DEFAULT 0,
	`displayed_by_default` int NOT NULL DEFAULT 1,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `demo_hubspot_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `demo_hubspot_field_unique` UNIQUE(`object_type`,`field_key`)
);
--> statement-breakpoint
CREATE TABLE `demo_hubspot_verification_attempts` (
	`claim_id` varchar(96) NOT NULL,
	`schema_version` varchar(16) NOT NULL,
	`submitted_at` datetime NOT NULL,
	`received_at` datetime NOT NULL,
	`slack_team_id` varchar(64) NOT NULL,
	`slack_user_id` varchar(120) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','verified','unresolved','ambiguous','rejected') NOT NULL,
	`result` json NOT NULL,
	`resolved_contact_id` varchar(64),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `demo_hubspot_verification_attempts_claim_id` PRIMARY KEY(`claim_id`)
);
--> statement-breakpoint
CREATE TABLE `demo_hubspot_write_audits` (
	`id` varchar(96) NOT NULL,
	`actor_user_id` varchar(64),
	`source` varchar(64) NOT NULL,
	`object_type` varchar(32) NOT NULL,
	`object_id` varchar(64) NOT NULL,
	`field_key` varchar(160),
	`old_value` json,
	`new_value` json,
	`claim_id` varchar(96),
	`reason` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `demo_hubspot_write_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `demo_hubspot_company_name_idx` ON `demo_hubspot_companies` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_company_domain_idx` ON `demo_hubspot_companies` (`normalized_domain`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_company_account_idx` ON `demo_hubspot_companies` (`account_id`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_contact_name_idx` ON `demo_hubspot_contacts` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_contact_email_idx` ON `demo_hubspot_contacts` (`normalized_email`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_contact_company_idx` ON `demo_hubspot_contacts` (`normalized_company`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_contact_account_idx` ON `demo_hubspot_contacts` (`account_id`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_deal_company_idx` ON `demo_hubspot_deals` (`company_id`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_deal_account_idx` ON `demo_hubspot_deals` (`account_id`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_deal_contact_idx` ON `demo_hubspot_deals` (`contact_id`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_field_search_idx` ON `demo_hubspot_field_definitions` (`object_type`,`searchable`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_verification_slack_idx` ON `demo_hubspot_verification_attempts` (`slack_team_id`,`slack_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_verification_status_idx` ON `demo_hubspot_verification_attempts` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_audit_object_idx` ON `demo_hubspot_write_audits` (`object_type`,`object_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `demo_hubspot_audit_claim_idx` ON `demo_hubspot_write_audits` (`claim_id`);