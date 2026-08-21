CREATE TABLE `hubspot_context_snapshots` (
	`id` varchar(96) NOT NULL,
	`contact_id` varchar(64) NOT NULL,
	`hubspot_contact_id` varchar(64) NOT NULL,
	`source_object_ids` json NOT NULL,
	`context` json NOT NULL,
	`retrieved_at` datetime NOT NULL,
	`status` enum('available','unavailable','error') NOT NULL,
	`error_code` varchar(120),
	CONSTRAINT `hubspot_context_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `hubspot_context_contact_idx` ON `hubspot_context_snapshots` (`contact_id`,`retrieved_at`);--> statement-breakpoint
CREATE INDEX `hubspot_context_hubspot_contact_idx` ON `hubspot_context_snapshots` (`hubspot_contact_id`,`retrieved_at`);