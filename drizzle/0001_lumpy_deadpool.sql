CREATE TABLE `trip_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`produk_id` integer NOT NULL,
	`qty_muat` integer NOT NULL,
	`qty_kembali` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trip_kanvas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trip_kanvas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sales_user_id` integer NOT NULL,
	`cabang_id` integer NOT NULL,
	`tujuan` text NOT NULL,
	`status` text NOT NULL,
	`tanggal_berangkat` integer,
	`tanggal_kembali` integer,
	`gudang_muat_user_id` integer,
	`gudang_rekon_user_id` integer,
	`catatan_selisih` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sales_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gudang_muat_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gudang_rekon_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `order` ADD `tipe` text DEFAULT 'taking_order' NOT NULL;--> statement-breakpoint
ALTER TABLE `order` ADD `trip_id` integer REFERENCES trip_kanvas(id);--> statement-breakpoint
ALTER TABLE `order` ADD `share_token` text;