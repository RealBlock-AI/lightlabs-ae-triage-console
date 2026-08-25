ALTER TABLE `contact_identities` ADD `user_id` int;--> statement-breakpoint
CREATE INDEX `contact_identity_user_status_idx` ON `contact_identities` (`user_id`,`verification_status`);