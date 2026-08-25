ALTER TABLE `orders` ADD `app_account_id` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD `testing_platform_company_id` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `testing_platform_company_id` varchar(64);--> statement-breakpoint
CREATE INDEX `orders_app_account_idx` ON `orders` (`app_account_id`);--> statement-breakpoint
CREATE INDEX `orders_testing_platform_company_idx` ON `orders` (`testing_platform_company_id`);--> statement-breakpoint
CREATE INDEX `products_testing_platform_company_idx` ON `products` (`testing_platform_company_id`);