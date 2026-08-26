-- interaction_attachments was created out-of-band on the demo database while
-- this work was verified against live data, so this migration reconciles
-- rather than assumes: a no-op where the table already exists, a create
-- everywhere else. The index is declared inside the table statement because
-- MySQL has no CREATE INDEX IF NOT EXISTS to guard a separate one with.
CREATE TABLE IF NOT EXISTS `interaction_attachments` (
	`id` varchar(80) NOT NULL,
	`interaction_id` varchar(80) NOT NULL,
	`slack_file_id` varchar(64) NOT NULL,
	`name` varchar(255),
	`mimetype` varchar(128),
	`filetype` varchar(32),
	`size_bytes` int,
	`permalink` varchar(512),
	`download_url` varchar(512),
	`stored_url` varchar(512),
	`is_external` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	CONSTRAINT `interaction_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `interaction_attachment_unique` UNIQUE(`interaction_id`,`slack_file_id`),
	KEY `interaction_attachment_interaction_idx` (`interaction_id`,`created_at`)
);
