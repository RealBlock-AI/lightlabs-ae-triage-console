CREATE TABLE `mcp_document_extractions` (
	`id` varchar(96) NOT NULL,
	`document_id` varchar(96) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`target_table` varchar(120) NOT NULL,
	`field_mappings` json NOT NULL,
	`extracted_values` json NOT NULL,
	`extraction_model` varchar(100) NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL,
	`requested_by_slack_user_id` varchar(100) NOT NULL,
	`created_at` datetime NOT NULL,
	`completed_at` datetime,
	`error_code` varchar(160),
	CONSTRAINT `mcp_document_extractions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_document_file_deliveries` (
	`id` varchar(96) NOT NULL,
	`document_id` varchar(96) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`requested_by_slack_user_id` varchar(100) NOT NULL,
	`requested_by_workspace_id` varchar(64) NOT NULL,
	`delivery_method` enum('mcp_signed_link') NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `mcp_document_file_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_documents` (
	`id` varchar(96) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`slack_workspace_id` varchar(64) NOT NULL,
	`slack_file_id` varchar(128),
	`storage_key` varchar(500) NOT NULL,
	`original_name` varchar(500) NOT NULL,
	`title` varchar(500) NOT NULL,
	`mime_type` varchar(255) NOT NULL,
	`size_bytes` int NOT NULL,
	`content_sha256` varchar(64) NOT NULL,
	`source` enum('slack_upload','internal_upload') NOT NULL,
	`uploaded_by_slack_user_id` varchar(100),
	`status` enum('available','deleted','quarantined') NOT NULL DEFAULT 'available',
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `mcp_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `slack_app_installations` (
	`id` varchar(96) NOT NULL,
	`slack_workspace_id` varchar(64) NOT NULL,
	`enterprise_id` varchar(64),
	`slack_app_id` varchar(64),
	`installer_slack_user_id` varchar(100),
	`bot_slack_user_id` varchar(100),
	`bot_token_encrypted` text NOT NULL,
	`granted_scopes` json NOT NULL,
	`status` enum('active','revoked','error') NOT NULL DEFAULT 'active',
	`installed_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `slack_app_installations_id` PRIMARY KEY(`id`),
	CONSTRAINT `slack_app_installation_workspace_unique` UNIQUE(`slack_workspace_id`)
);
--> statement-breakpoint
CREATE TABLE `slack_oauth_states` (
	`id` varchar(96) NOT NULL,
	`state_hash` varchar(64) NOT NULL,
	`requested_by_user_id` varchar(64) NOT NULL,
	`created_at` datetime NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	CONSTRAINT `slack_oauth_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `slack_oauth_states_state_hash_unique` UNIQUE(`state_hash`)
);
--> statement-breakpoint
CREATE INDEX `mcp_document_extractions_document_idx` ON `mcp_document_extractions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mcp_document_extractions_account_status_idx` ON `mcp_document_extractions` (`account_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `mcp_document_file_deliveries_document_idx` ON `mcp_document_file_deliveries` (`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mcp_document_file_deliveries_account_idx` ON `mcp_document_file_deliveries` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mcp_documents_account_updated_idx` ON `mcp_documents` (`account_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `mcp_documents_slack_file_idx` ON `mcp_documents` (`slack_workspace_id`,`slack_file_id`);--> statement-breakpoint
CREATE INDEX `slack_app_installation_status_idx` ON `slack_app_installations` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `slack_oauth_states_expiry_idx` ON `slack_oauth_states` (`expires_at`);