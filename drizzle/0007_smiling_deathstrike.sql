ALTER TABLE `team_members` ADD `slack_user_id` varchar(100);--> statement-breakpoint
ALTER TABLE `team_members` ADD `slack_workspace_id` varchar(64);--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_slack_identity_unique` UNIQUE(`slack_workspace_id`,`slack_user_id`);