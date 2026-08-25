CREATE TABLE `action_limits` (
	`id` varchar(64) NOT NULL,
	`sku_id` varchar(64) NOT NULL,
	`analyte_id` varchar(64) NOT NULL,
	`limit_type` varchar(80) NOT NULL,
	`limit_unit` varchar(32),
	`limit_basis` enum('per_serving','per_kg','per_capsule','per_100g'),
	`lower_bound` decimal(16,6),
	`upper_bound` decimal(16,6),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `action_limits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analyte_company_units` (
	`id` varchar(64) NOT NULL,
	`analyte_id` varchar(64) NOT NULL,
	`company_id` varchar(64) NOT NULL,
	`platform_unit` varchar(32) NOT NULL,
	`coa_unit` varchar(32) NOT NULL,
	`pip_unit` varchar(32) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `analyte_company_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `analyte_company_units_unique` UNIQUE(`analyte_id`,`company_id`)
);
--> statement-breakpoint
CREATE TABLE `analytes` (
	`id` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`short_name` varchar(64),
	`category_id` varchar(64),
	`lims_id` varchar(64),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `analytes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assay_company_prices` (
	`id` varchar(64) NOT NULL,
	`assay_id` varchar(64) NOT NULL,
	`company_id` varchar(64) NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `assay_company_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `assay_company_price_unique` UNIQUE(`assay_id`,`company_id`)
);
--> statement-breakpoint
CREATE TABLE `assays` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`method` varchar(200),
	`method_description` text,
	`price` decimal(12,2),
	`laboratory_id` varchar(64),
	`accredited` int NOT NULL DEFAULT 0,
	`for_prop_65` int NOT NULL DEFAULT 0,
	`for_ab899` int NOT NULL DEFAULT 0,
	`purchasable` int NOT NULL DEFAULT 1,
	`requires_sfp` int NOT NULL DEFAULT 0,
	`minimum_sample_size_grams` decimal(12,4),
	`average_turnaround_time_hours` int,
	`turnaround_time_label` varchar(120),
	`weekend_start` int NOT NULL DEFAULT 0,
	`holiday_start` int NOT NULL DEFAULT 0,
	`same_day_cutoff_hour` int,
	`lims_id` varchar(64),
	`archived_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `assays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(64),
	`website` varchar(255),
	`billing_email` varchar(320),
	`reporting_emails` json,
	`payment_method` enum('credit_card','invoice'),
	`lims_id` varchar(64),
	`stripe_id` varchar(64),
	`hubspot_company_id` varchar(64),
	`archived_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_memberships` (
	`id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`company_id` varchar(64) NOT NULL,
	`role` varchar(80) NOT NULL,
	`view_results` int NOT NULL DEFAULT 0,
	`receive_coman_coas` int NOT NULL DEFAULT 0,
	`order_placed_notifications` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `company_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_membership_user_company_unique` UNIQUE(`user_id`,`company_id`)
);
--> statement-breakpoint
CREATE TABLE `limit_group_sku_assignments` (
	`id` varchar(64) NOT NULL,
	`limit_group_id` varchar(64) NOT NULL,
	`sku_id` varchar(64) NOT NULL,
	`missing_serving_size` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `limit_group_sku_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `limit_group_sku_unique` UNIQUE(`limit_group_id`,`sku_id`)
);
--> statement-breakpoint
CREATE TABLE `limit_groups` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`source` varchar(200) NOT NULL,
	`lims_id` varchar(64),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `limit_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partnerships` (
	`id` varchar(64) NOT NULL,
	`source_company_id` varchar(64) NOT NULL,
	`target_company_id` varchar(64) NOT NULL,
	`role` varchar(80) NOT NULL,
	`payer` varchar(80),
	`active` int NOT NULL DEFAULT 1,
	`view_results` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `partnerships_id` PRIMARY KEY(`id`),
	CONSTRAINT `partnership_pair_unique` UNIQUE(`source_company_id`,`target_company_id`)
);
--> statement-breakpoint
CREATE TABLE `regulatory_limits` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`analyte_id` varchar(64) NOT NULL,
	`citation` varchar(255),
	`limit_type` varchar(80) NOT NULL,
	`limit_unit` varchar(32),
	`limit_basis` enum('per_serving','per_kg','per_capsule','per_100g'),
	`lower_bound` decimal(16,6),
	`upper_bound` decimal(16,6),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `regulatory_limits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` varchar(64) NOT NULL,
	`test_id` varchar(64),
	`state` varchar(80) NOT NULL,
	`attached_to` varchar(120),
	`is_public` int NOT NULL DEFAULT 0,
	`date_generated` datetime,
	`date_published` datetime,
	`render_status` varchar(80),
	`lims_id` varchar(64),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `samples` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`order_id` varchar(64) NOT NULL,
	`sku_id` varchar(64) NOT NULL,
	`lot` varchar(160),
	`batch` varchar(160),
	`composite` int NOT NULL DEFAULT 0,
	`number_of_composites` int,
	`parent_id` varchar(64),
	`shipment_id` varchar(64),
	`laboratory_id` varchar(64),
	`time_of_collection` datetime NOT NULL,
	`serving_size_grams` decimal(12,4),
	`serving_size_unit` varchar(32),
	`lab_reported_serving_size` decimal(12,4),
	`lab_reported_serving_size_unit` varchar(32),
	`sfp_text` text,
	`lims_id` varchar(64),
	`archived_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` varchar(64) NOT NULL,
	`company_id` varchar(64) NOT NULL,
	`status` varchar(80) NOT NULL,
	`carrier` varchar(80),
	`tracking_number` varchar(160),
	`estimated_delivery_date` datetime,
	`pre_transit_at` datetime,
	`in_transit_at` datetime,
	`out_for_delivery_at` datetime,
	`delivered_at` datetime,
	`return_to_sender_at` datetime,
	`failure_at` datetime,
	`error_messages` json,
	`lims_id` varchar(64),
	`archived_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skus` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`code` varchar(120) NOT NULL,
	`supplier` varchar(160),
	`product_id` varchar(64) NOT NULL,
	`serving_size_grams` decimal(12,4),
	`serving_size_unit` varchar(32),
	`spec_requires_serving_size` int NOT NULL DEFAULT 0,
	`lims_id` varchar(64),
	`archived_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `skus_id` PRIMARY KEY(`id`),
	CONSTRAINT `skus_product_code_unique` UNIQUE(`product_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `specifications` (
	`id` varchar(64) NOT NULL,
	`sku_id` varchar(64) NOT NULL,
	`analyte_id` varchar(64) NOT NULL,
	`source` varchar(200) NOT NULL,
	`limit_type` varchar(80) NOT NULL,
	`limit_unit` varchar(32),
	`limit_basis` enum('per_serving','per_kg','per_capsule','per_100g'),
	`lower_bound` decimal(16,6),
	`upper_bound` decimal(16,6),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `specifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `specifications_sku_analyte_unique` UNIQUE(`sku_id`,`analyte_id`)
);
--> statement-breakpoint
CREATE TABLE `stability_studies` (
	`id` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`company_id` varchar(64) NOT NULL,
	`sku_id` varchar(64) NOT NULL,
	`arm` varchar(100),
	`required_units` int,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `stability_studies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stability_study_time_points` (
	`id` varchar(64) NOT NULL,
	`stability_study_id` varchar(64) NOT NULL,
	`month_offset` int NOT NULL,
	`date` datetime NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `stability_study_time_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `test_limits` (
	`id` varchar(64) NOT NULL,
	`test_id` varchar(64) NOT NULL,
	`analyte_id` varchar(64) NOT NULL,
	`customized` int NOT NULL DEFAULT 0,
	`source` varchar(200) NOT NULL,
	`lims_id` varchar(64),
	`limit_type` varchar(80) NOT NULL,
	`limit_unit` varchar(32),
	`limit_basis` enum('per_serving','per_kg','per_capsule','per_100g'),
	`lower_bound` decimal(16,6),
	`upper_bound` decimal(16,6),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `test_limits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` varchar(64) NOT NULL,
	`test_id` varchar(64) NOT NULL,
	`analyte_id` varchar(64) NOT NULL,
	`concentration` decimal(16,6),
	`unit` varchar(32) NOT NULL,
	`lod` decimal(16,6),
	`loq` decimal(16,6),
	`evaluation` varchar(120),
	`observation` text,
	`lims_id` varchar(64),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `test_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `test_results_test_analyte_unique` UNIQUE(`test_id`,`analyte_id`)
);
--> statement-breakpoint
CREATE TABLE `turnaround_times` (
	`id` varchar(64) NOT NULL,
	`assay_id` varchar(64) NOT NULL,
	`days` int NOT NULL,
	`fee` decimal(12,2) NOT NULL,
	`fee_type` varchar(80) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `turnaround_times_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `action_limits_sku_analyte_idx` ON `action_limits` (`sku_id`,`analyte_id`);--> statement-breakpoint
CREATE INDEX `company_membership_company_idx` ON `company_memberships` (`company_id`);--> statement-breakpoint
CREATE INDEX `partnership_target_idx` ON `partnerships` (`target_company_id`);--> statement-breakpoint
CREATE INDEX `regulatory_limits_regime_analyte_idx` ON `regulatory_limits` (`name`,`analyte_id`);--> statement-breakpoint
CREATE INDEX `reports_test_idx` ON `reports` (`test_id`);--> statement-breakpoint
CREATE INDEX `samples_sku_collected_idx` ON `samples` (`sku_id`,`time_of_collection`);--> statement-breakpoint
CREATE INDEX `samples_order_idx` ON `samples` (`order_id`);--> statement-breakpoint
CREATE INDEX `shipments_company_idx` ON `shipments` (`company_id`);--> statement-breakpoint
CREATE INDEX `skus_product_idx` ON `skus` (`product_id`);--> statement-breakpoint
CREATE INDEX `stability_studies_sku_idx` ON `stability_studies` (`sku_id`);--> statement-breakpoint
CREATE INDEX `stability_points_study_idx` ON `stability_study_time_points` (`stability_study_id`);--> statement-breakpoint
CREATE INDEX `test_limits_test_analyte_idx` ON `test_limits` (`test_id`,`analyte_id`);--> statement-breakpoint
CREATE INDEX `test_results_analyte_idx` ON `test_results` (`analyte_id`);--> statement-breakpoint
CREATE INDEX `turnaround_times_assay_idx` ON `turnaround_times` (`assay_id`);