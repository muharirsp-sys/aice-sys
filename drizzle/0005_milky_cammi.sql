CREATE TABLE `produk_satuan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`produk_id` integer NOT NULL,
	`satuan` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`produk_id`) REFERENCES `produk`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `order_item` ADD `satuan_id` integer REFERENCES produk_satuan(id);
--> statement-breakpoint
INSERT INTO `produk_satuan` (`produk_id`, `satuan`, `is_default`) SELECT `id`, `satuan`, 1 FROM `produk`;