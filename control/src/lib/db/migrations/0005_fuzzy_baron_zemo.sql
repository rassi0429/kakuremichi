CREATE TABLE `tunnel_gateway_ips` (
	`tunnel_id` text NOT NULL,
	`gateway_id` text NOT NULL,
	`ip` text(15) NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`tunnel_id`, `gateway_id`),
	FOREIGN KEY (`tunnel_id`) REFERENCES `tunnels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gateway_id`) REFERENCES `gateways`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `tunnels` DROP COLUMN `gateway_ip`;