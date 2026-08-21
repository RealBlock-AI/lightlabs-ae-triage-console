ALTER TABLE `interactions` ADD `verified_reply_status` enum('eligible','ineligible') DEFAULT 'ineligible' NOT NULL;--> statement-breakpoint
ALTER TABLE `interactions` ADD `reply_gate_reasons` json;--> statement-breakpoint
UPDATE `interactions` SET `reply_gate_reasons` = JSON_ARRAY('Legacy interaction predates the deterministic verified-reply gate. Human review required.') WHERE `reply_gate_reasons` IS NULL;--> statement-breakpoint
ALTER TABLE `interactions` MODIFY `reply_gate_reasons` json NOT NULL;
