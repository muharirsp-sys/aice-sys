CREATE TABLE `kartu_stok` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`produk_id` integer NOT NULL,
	`cabang_id` integer NOT NULL,
	`tipe` text NOT NULL,
	`qty` integer NOT NULL,
	`qty_saldo` integer NOT NULL,
	`keterangan` text,
	`ref_type` text,
	`ref_id` integer,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stok_cabang` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`produk_id` integer NOT NULL,
	`cabang_id` integer NOT NULL,
	`qty` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "chk_stok_non_negative" CHECK("stok_cabang"."qty" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stok_cabang_produk_cabang_idx` ON `stok_cabang` (`produk_id`,`cabang_id`);