CREATE TABLE `accounts` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`account_type` enum('brand','coman') NOT NULL,
	`annual_spend` int NOT NULL,
	`slack_channel` varchar(100),
	`owner_id` varchar(64) NOT NULL,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clarifications` (
	`id` varchar(80) NOT NULL,
	`interaction_id` varchar(80) NOT NULL,
	`question` text NOT NULL,
	`asked_at` datetime NOT NULL,
	`answered_at` datetime,
	CONSTRAINT `clarifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` varchar(64) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(255),
	`slack_user_id` varchar(100),
	`role_title` varchar(160),
	`has_platform_login` int NOT NULL DEFAULT 0,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contacts_slack_unique` UNIQUE(`slack_user_id`)
);
--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` varchar(80) NOT NULL,
	`source` varchar(32) NOT NULL,
	`channel_ref` varchar(180),
	`contact_id` varchar(64),
	`account_id` varchar(64),
	`owner_id` varchar(64),
	`received_at` datetime NOT NULL,
	`raw_text` text NOT NULL,
	`intents` json,
	`confidence` decimal(5,4),
	`imminent_action` int NOT NULL DEFAULT 0,
	`classifier_method` varchar(40) NOT NULL,
	`base_lane` enum('auto','assisted','escalate'),
	`lane` enum('auto','assisted','escalate') NOT NULL,
	`lane_reasons` json NOT NULL,
	`acknowledgment` text NOT NULL,
	`draft` text,
	`evidence` json NOT NULL,
	`precedent` json,
	`send_allowed` int NOT NULL DEFAULT 0,
	`send_disabled` int NOT NULL DEFAULT 0,
	`status` enum('open','awaiting_customer','auto_resolved','resolved') NOT NULL DEFAULT 'open',
	`ms_to_ack` int NOT NULL,
	`human_minutes_saved` decimal(8,2) NOT NULL DEFAULT '0',
	`queue_priority` int NOT NULL,
	`sla_minutes` int NOT NULL,
	`resolved_at` datetime,
	`resolved_by` varchar(64),
	CONSTRAINT `interactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `interaction_dedup_unique` UNIQUE(`source`,`channel_ref`)
);
--> statement-breakpoint
CREATE TABLE `kb_entries` (
	`id` varchar(64) NOT NULL,
	`question_pattern` varchar(255) NOT NULL,
	`answer` text NOT NULL,
	`author` varchar(160) NOT NULL,
	`approved_by` varchar(160),
	`created_at` datetime NOT NULL,
	CONSTRAINT `kb_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`coman_id` varchar(64),
	`produced_at` datetime NOT NULL,
	CONSTRAINT `lots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(64) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`placed_at` datetime NOT NULL,
	`promised_at` datetime,
	`status` varchar(64) NOT NULL,
	`queue_position` int,
	`assay_group` varchar(100),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(64) NOT NULL,
	`account_id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`category` varchar(100) NOT NULL,
	`serving_size_g` decimal(10,2),
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `response_feedback` (
	`id` varchar(80) NOT NULL,
	`interaction_id` varchar(80) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`drafted_text` text,
	`sent_text` text NOT NULL,
	`edit_ratio` decimal(6,4) NOT NULL,
	`category` varchar(100) NOT NULL,
	`lane` varchar(32) NOT NULL,
	`override_reason` text,
	`created_at` datetime NOT NULL,
	CONSTRAINT `response_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `results` (
	`id` varchar(64) NOT NULL,
	`test_id` varchar(64) NOT NULL,
	`analyte` varchar(100) NOT NULL,
	`value` decimal(14,4),
	`unit` varchar(64) NOT NULL,
	`is_non_detect` int NOT NULL DEFAULT 0,
	`loq` decimal(14,4),
	`reported_at` datetime NOT NULL,
	CONSTRAINT `results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `specs` (
	`id` varchar(64) NOT NULL,
	`scope` varchar(64) NOT NULL,
	`scope_id` varchar(64),
	`category` varchar(100),
	`analyte` varchar(100) NOT NULL,
	`limit_value` decimal(14,4),
	`limit_unit` varchar(64),
	`source` varchar(100) NOT NULL,
	`citation` text,
	`is_placeholder` int NOT NULL DEFAULT 0,
	CONSTRAINT `specs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` enum('ae','lab_director','admin') NOT NULL,
	CONSTRAINT `team_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tests` (
	`id` varchar(64) NOT NULL,
	`order_id` varchar(64),
	`lot_id` varchar(64),
	`assay` varchar(100) NOT NULL,
	`status` varchar(64) NOT NULL,
	`completed_at` datetime,
	CONSTRAINT `tests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `contacts_account_idx` ON `contacts` (`account_id`);--> statement-breakpoint
CREATE INDEX `interaction_owner_idx` ON `interactions` (`owner_id`,`lane`,`received_at`);--> statement-breakpoint
CREATE INDEX `interaction_account_idx` ON `interactions` (`account_id`);