CREATE TABLE `hubspot_connections` (
	`id` varchar(96) NOT NULL,
	`connected_by_user_id` varchar(64) NOT NULL,
	`portal_id` varchar(64),
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`access_token_expires_at` datetime,
	`status` enum('active','revoked','error') NOT NULL DEFAULT 'active',
	`connected_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `hubspot_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hubspot_oauth_sessions` (
	`id` varchar(96) NOT NULL,
	`state_hash` varchar(64) NOT NULL,
	`code_verifier_encrypted` text NOT NULL,
	`requested_by_user_id` varchar(64) NOT NULL,
	`created_at` datetime NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	CONSTRAINT `hubspot_oauth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `hubspot_oauth_sessions_state_hash_unique` UNIQUE(`state_hash`)
);
--> statement-breakpoint
CREATE INDEX `hubspot_connections_status_idx` ON `hubspot_connections` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `hubspot_oauth_sessions_expiry_idx` ON `hubspot_oauth_sessions` (`expires_at`);