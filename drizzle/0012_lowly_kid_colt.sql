CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`recipient_id` integer NOT NULL,
	`actor_id` integer NOT NULL,
	`subject_id` integer NOT NULL,
	`detail` text,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `notifications_opened_at` text;