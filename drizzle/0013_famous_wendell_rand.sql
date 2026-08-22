CREATE TABLE `ingest_channel_policies` (
	`id` varchar(96) NOT NULL,
	`slack_workspace_id` varchar(64) NOT NULL,
	`channel_id` varchar(100) NOT NULL,
	`authoritative_transport` enum('native_slack','custom_bridge','disabled') NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `ingest_channel_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `ingest_channel_policy_unique` UNIQUE(`slack_workspace_id`,`channel_id`)
);
--> statement-breakpoint
CREATE INDEX `ingest_channel_policy_transport_idx` ON `ingest_channel_policies` (`authoritative_transport`,`enabled`);