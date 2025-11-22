ALTER TABLE `agents` ADD `wireguard_private_key` text(256);--> statement-breakpoint
ALTER TABLE `gateways` ADD `wireguard_private_key` text(256);