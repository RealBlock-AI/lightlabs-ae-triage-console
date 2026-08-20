CREATE TABLE `knowledge_documents` (
	`id` varchar(96) NOT NULL,
	`source_id` varchar(96) NOT NULL,
	`content` text NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`fetched_at` datetime NOT NULL,
	`indexed_at` datetime NOT NULL,
	`status` enum('indexed','failed','superseded') NOT NULL DEFAULT 'indexed',
	CONSTRAINT `knowledge_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_document_hash_unique` UNIQUE(`source_id`,`content_hash`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_retrieval_events` (
	`id` varchar(96) NOT NULL,
	`query_text` text NOT NULL,
	`interaction_id` varchar(80),
	`retrieved_at` datetime NOT NULL,
	`top_score` decimal(5,4) NOT NULL DEFAULT '0',
	`source_count` int NOT NULL DEFAULT 0,
	`gate` enum('open','closed') NOT NULL,
	`reasons` json NOT NULL,
	CONSTRAINT `knowledge_retrieval_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` varchar(96) NOT NULL,
	`canonical_url` varchar(500) NOT NULL,
	`title` varchar(300) NOT NULL,
	`source_type` enum('insight','test_menu','compliance') NOT NULL,
	`retrieval_status` enum('eligible','discovery_only','disabled') NOT NULL DEFAULT 'eligible',
	`answer_safety` enum('general_knowledge','review_required') NOT NULL DEFAULT 'general_knowledge',
	`discovery_score` decimal(5,4),
	`last_fetched_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `knowledge_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_sources_canonical_url_unique` UNIQUE(`canonical_url`)
);
--> statement-breakpoint
ALTER TABLE `contacts` DROP INDEX `contacts_slack_unique`;--> statement-breakpoint
ALTER TABLE `contacts` ADD `slack_workspace_id` varchar(64);--> statement-breakpoint
ALTER TABLE `contacts` ADD `hubspot_portal_id` varchar(64);--> statement-breakpoint
ALTER TABLE `contacts` ADD `hubspot_contact_id` varchar(64);--> statement-breakpoint
ALTER TABLE `contacts` ADD `identity_status` enum('pending','verified','revoked') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD `verified_at` datetime;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_slack_identity_unique` UNIQUE(`slack_workspace_id`,`slack_user_id`);--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_hubspot_identity_unique` UNIQUE(`hubspot_portal_id`,`hubspot_contact_id`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_source_idx` ON `knowledge_documents` (`source_id`,`status`);--> statement-breakpoint
CREATE INDEX `knowledge_retrieval_events_interaction_idx` ON `knowledge_retrieval_events` (`interaction_id`,`retrieved_at`);--> statement-breakpoint
CREATE INDEX `knowledge_sources_status_idx` ON `knowledge_sources` (`retrieval_status`,`answer_safety`);