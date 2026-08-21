CREATE TABLE `integration_audit_events` (
	`id` varchar(96) NOT NULL,
	`surface` enum('slack_ingest','mcp') NOT NULL,
	`event_type` varchar(80) NOT NULL,
	`outcome` enum('accepted','rejected','error') NOT NULL,
	`status_code` int NOT NULL,
	`slack_workspace_id` varchar(64),
	`slack_user_id` varchar(100),
	`method` varchar(100),
	`tool_name` varchar(120),
	`interaction_id` varchar(80),
	`metadata` json NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `integration_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `integration_audit_surface_created_idx` ON `integration_audit_events` (`surface`,`created_at`);--> statement-breakpoint
CREATE INDEX `integration_audit_outcome_created_idx` ON `integration_audit_events` (`outcome`,`created_at`);