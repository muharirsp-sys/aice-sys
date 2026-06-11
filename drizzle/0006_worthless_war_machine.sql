CREATE TABLE `tanda_terima` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cabang_id` integer NOT NULL,
	`admin_user_id` integer NOT NULL,
	`tanggal` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`bukti_url` text,
	`gudang_user_id` integer,
	`dikonfirmasi_at` integer,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`admin_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gudang_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tanda_terima_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tanda_terima_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`catatan` text,
	FOREIGN KEY (`tanda_terima_id`) REFERENCES `tanda_terima`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action
);
