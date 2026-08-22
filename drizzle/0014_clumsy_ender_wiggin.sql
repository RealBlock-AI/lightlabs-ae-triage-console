CREATE TABLE `external_slack_identity_candidates` (
	`id` varchar(96) NOT NULL,
	`slack_workspace_id` varchar(64) NOT NULL,
	`slack_user_id` varchar(100) NOT NULL,
	`status` enum('pending','mapped','ignored') NOT NULL DEFAULT 'pending',
	`first_seen_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	`last_channel_id` varchar(100),
	`last_channel_type` varchar(24),
	`externally_shared_channel` int NOT NULL DEFAULT 0,
	`source_transport` enum('custom_bridge','native_slack') NOT NULL,
	`last_interaction_id` varchar(80),
	`resolved_contact_id` varchar(64),
	`resolved_at` datetime,
	`resolved_by_user_id` varchar(64),
	CONSTRAINT `external_slack_identity_candidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_slack_identity_candidate_unique` UNIQUE(`slack_workspace_id`,`slack_user_id`)
);
--> statement-breakpoint
CREATE INDEX `external_slack_identity_candidate_status_idx` ON `external_slack_identity_candidates` (`status`,`last_seen_at`);