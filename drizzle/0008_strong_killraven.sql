ALTER TABLE `kartu_stok` ADD `reference_id` text;--> statement-breakpoint
CREATE INDEX `kartu_stok_cabang_created_idx` ON `kartu_stok` (`cabang_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `stok_cabang` ADD `updated_at` integer;