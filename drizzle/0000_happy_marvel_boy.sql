CREATE TABLE `account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `approval` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`admin_user_id` integer NOT NULL,
	`approved_at` integer,
	`status` text NOT NULL,
	`alasan_tolak` text,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`admin_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`table_affected` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cabang` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`alamat` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_closing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tanggal` text NOT NULL,
	`cabang_id` integer NOT NULL,
	`sales_done` integer NOT NULL,
	`admin_done` integer NOT NULL,
	`gudang_done` integer NOT NULL,
	`delivery_done` integer NOT NULL,
	`incaso_done` integer NOT NULL,
	`is_locked` integer NOT NULL,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `diskon_toko` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`toko_id` integer NOT NULL,
	`produk_id` integer NOT NULL,
	`diskon_persen` integer NOT NULL,
	`diskon_rupiah` integer NOT NULL,
	`batas_diskon_persen` integer NOT NULL,
	`batas_diskon_rupiah` integer NOT NULL,
	FOREIGN KEY (`toko_id`) REFERENCES `toko`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `harga_cabang` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`produk_id` integer NOT NULL,
	`cabang_id` integer NOT NULL,
	`harga` integer NOT NULL,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`pelapor_user_id` integer NOT NULL,
	`role_pelapor` text NOT NULL,
	`deskripsi` text NOT NULL,
	`waktu_lapor` integer NOT NULL,
	`status` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pelapor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`toko_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`tanggal` integer NOT NULL,
	`status` text NOT NULL,
	`cabang_id` integer NOT NULL,
	FOREIGN KEY (`toko_id`) REFERENCES `toko`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`produk_id` integer NOT NULL,
	`qty` integer NOT NULL,
	`harga_satuan` integer NOT NULL,
	`diskon_persen_applied` integer NOT NULL,
	`diskon_rupiah_applied` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pembayaran` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`incaso_user_id` integer NOT NULL,
	`tanggal_bayar` integer NOT NULL,
	`jumlah` integer NOT NULL,
	`metode` text NOT NULL,
	`bukti_bayar_url` text,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`incaso_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pengiriman` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`delivery_user_id` integer NOT NULL,
	`dikirim` integer,
	`diterima` integer,
	`bukti_terima_url` text,
	`gps_coord` text,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delivery_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `produk` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`sku` text NOT NULL,
	`satuan` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `produk_sku_unique` ON `produk` (`sku`);--> statement-breakpoint
CREATE TABLE `role` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `toko` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`alamat` text,
	`no_telp` text,
	`cabang_id` integer NOT NULL,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`email` text NOT NULL,
	`password` text,
	`role_id` integer NOT NULL,
	`cabang_id` integer NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cabang_id`) REFERENCES `cabang`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
