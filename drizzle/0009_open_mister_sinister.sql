CREATE TABLE `slack_mcp_identity_requests` (
	`id` varchar(96) NOT NULL,
	`slack_workspace_id` varchar(64) NOT NULL,
	`slack_user_id` varchar(100) NOT NULL,
	`enterprise_id` varchar(64),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`first_seen_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	`approved_team_member_id` varchar(64),
	`approved_at` datetime,
	CONSTRAINT `slack_mcp_identity_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `slack_mcp_identity_request_unique` UNIQUE(`slack_workspace_id`,`slack_user_id`)
);
--> statement-breakpoint
CREATE INDEX `slack_mcp_identity_request_status_idx` ON `slack_mcp_identity_requests` (`status`,`last_seen_at`);