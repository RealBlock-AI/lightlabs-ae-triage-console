CREATE TABLE `slack_account_bindings` (
	`binding_id` varchar(128) NOT NULL,
	`schema_version` varchar(16) NOT NULL,
	`requested_at` datetime NOT NULL,
	`slack_team_id` varchar(64) NOT NULL,
	`slack_user_id` varchar(120) NOT NULL,
	`slack_display_name` varchar(160),
	`claimed_full_name` varchar(160) NOT NULL,
	`claimed_email` varchar(320) NOT NULL,
	`claimed_company` varchar(240) NOT NULL,
	`email_source` enum('slack','typed') NOT NULL,
	`status` enum('pending','bound','conflict','rejected') NOT NULL,
	`contact_id` varchar(64),
	`account_id` varchar(64),
	`conflict` json,
	`review_url` varchar(500),
	`message` varchar(500),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `slack_account_bindings_binding_id` PRIMARY KEY(`binding_id`)
);
--> statement-breakpoint
CREATE INDEX `slack_binding_identity_idx` ON `slack_account_bindings` (`slack_team_id`,`slack_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `slack_binding_contact_idx` ON `slack_account_bindings` (`contact_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `slack_binding_status_idx` ON `slack_account_bindings` (`status`,`updated_at`);