CREATE TABLE `bobby_support_requests` (
	`request_id` varchar(128) NOT NULL,
	`schema_version` varchar(32) NOT NULL,
	`slack_workspace_id` varchar(64) NOT NULL,
	`slack_user_id` varchar(100) NOT NULL,
	`interaction_id` varchar(80),
	`status` enum('answered','needs_more_info','escalate','no_match') NOT NULL,
	`response` json NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `bobby_support_requests_request_id` PRIMARY KEY(`request_id`)
);
--> statement-breakpoint
ALTER TABLE `integration_audit_events` MODIFY COLUMN `surface` enum('slack_ingest','mcp','bobby') NOT NULL;--> statement-breakpoint
CREATE INDEX `bobby_support_requests_slack_identity_idx` ON `bobby_support_requests` (`slack_workspace_id`,`slack_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bobby_support_requests_interaction_idx` ON `bobby_support_requests` (`interaction_id`);