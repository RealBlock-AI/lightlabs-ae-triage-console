CREATE TABLE `contact_identities` (
	`id` varchar(96) NOT NULL,
	`contact_id` varchar(64) NOT NULL,
	`provider` enum('slack','hubspot','email') NOT NULL,
	`tenant_id` varchar(100) NOT NULL,
	`external_id` varchar(255) NOT NULL,
	`email_normalized` varchar(320),
	`verification_status` enum('pending','verified','revoked','expired') NOT NULL DEFAULT 'pending',
	`verification_method` enum('admin_confirmed','hubspot_exact_email','provisioned','customer_claimed') NOT NULL,
	`verified_at` datetime,
	`revoked_at` datetime,
	`verified_by_user_id` varchar(64),
	`attributes` json,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `contact_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_identity_provider_tenant_external_unique` UNIQUE(`provider`,`tenant_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_sections` (
	`id` varchar(96) NOT NULL,
	`document_id` varchar(96) NOT NULL,
	`ordinal` int NOT NULL,
	`heading_path` varchar(1000) NOT NULL,
	`anchor` varchar(255) NOT NULL,
	`markdown_content` mediumtext NOT NULL,
	`excerpt` text NOT NULL,
	`token_count` int NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`answer_safety` enum('general_knowledge','review_required','blocked') NOT NULL DEFAULT 'general_knowledge',
	`effective_from` datetime,
	`effective_to` datetime,
	CONSTRAINT `knowledge_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_section_document_anchor_unique` UNIQUE(`document_id`,`anchor`)
);
--> statement-breakpoint
ALTER TABLE `interactions` ADD `external_event_id` varchar(255);--> statement-breakpoint
ALTER TABLE `interactions` ADD `source_schema_version` varchar(32);--> statement-breakpoint
ALTER TABLE `interactions` ADD `thread_ref` varchar(180);--> statement-breakpoint
ALTER TABLE `interactions` ADD `source_received_at` datetime;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `markdown_content` mediumtext;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `content_format` enum('markdown','html','pdf_text','plain_text') DEFAULT 'plain_text' NOT NULL;--> statement-breakpoint
ALTER TABLE `knowledge_documents` ADD `parser_version` varchar(64);--> statement-breakpoint
INSERT INTO `contact_identities` (`id`,`contact_id`,`provider`,`tenant_id`,`external_id`,`email_normalized`,`verification_status`,`verification_method`,`verified_at`,`revoked_at`,`verified_by_user_id`,`attributes`,`created_at`,`updated_at`)
SELECT CONCAT('ci_slack_', `id`), `id`, 'slack', `slack_workspace_id`, `slack_user_id`, `email`, CASE WHEN `identity_status` = 'verified' THEN 'verified' WHEN `identity_status` = 'revoked' THEN 'revoked' ELSE 'pending' END, 'provisioned', `verified_at`, NULL, NULL, NULL, NOW(), NOW()
FROM `contacts` WHERE `slack_workspace_id` IS NOT NULL AND `slack_user_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `contact_identities` (`id`,`contact_id`,`provider`,`tenant_id`,`external_id`,`email_normalized`,`verification_status`,`verification_method`,`verified_at`,`revoked_at`,`verified_by_user_id`,`attributes`,`created_at`,`updated_at`)
SELECT CONCAT('ci_hubspot_', `id`), `id`, 'hubspot', COALESCE(`hubspot_portal_id`, 'connected_mcp'), `hubspot_contact_id`, `email`, CASE WHEN `identity_status` = 'verified' THEN 'verified' WHEN `identity_status` = 'revoked' THEN 'revoked' ELSE 'pending' END, 'hubspot_exact_email', `verified_at`, NULL, NULL, NULL, NOW(), NOW()
FROM `contacts` WHERE `hubspot_contact_id` IS NOT NULL;--> statement-breakpoint
INSERT INTO `contact_identities` (`id`,`contact_id`,`provider`,`tenant_id`,`external_id`,`email_normalized`,`verification_status`,`verification_method`,`verified_at`,`revoked_at`,`verified_by_user_id`,`attributes`,`created_at`,`updated_at`)
SELECT CONCAT('ci_email_', `id`), `id`, 'email', 'light_labs', LOWER(`email`), LOWER(`email`), CASE WHEN `identity_status` = 'verified' THEN 'verified' ELSE 'pending' END, 'provisioned', `verified_at`, NULL, NULL, NULL, NOW(), NOW()
FROM `contacts` WHERE `email` IS NOT NULL;--> statement-breakpoint
UPDATE `interactions` SET `external_event_id` = `channel_ref`, `source_schema_version` = 'legacy-1', `source_received_at` = `received_at` WHERE `external_event_id` IS NULL AND `channel_ref` IS NOT NULL;--> statement-breakpoint
UPDATE `knowledge_documents` SET `markdown_content` = `content`, `content_format` = 'markdown', `parser_version` = 'main-content-markdown-v1' WHERE `markdown_content` IS NULL;--> statement-breakpoint
INSERT INTO `knowledge_sections` (`id`,`document_id`,`ordinal`,`heading_path`,`anchor`,`markdown_content`,`excerpt`,`token_count`,`content_hash`,`answer_safety`,`effective_from`,`effective_to`)
SELECT CONCAT('ks_backfill_', LEFT(`id`, 64)), `id`, 0, 'Overview', 'overview', `markdown_content`, LEFT(`markdown_content`, 500), CEIL(CHAR_LENGTH(`markdown_content`) / 4), SHA2(CONCAT(`content_hash`, ':overview'), 256), 'general_knowledge', `fetched_at`, NULL FROM `knowledge_documents` WHERE `markdown_content` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `interactions` ADD CONSTRAINT `interaction_external_event_unique` UNIQUE(`source`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `contact_identity_contact_status_idx` ON `contact_identities` (`contact_id`,`verification_status`);--> statement-breakpoint
CREATE INDEX `knowledge_section_document_ordinal_idx` ON `knowledge_sections` (`document_id`,`ordinal`);
