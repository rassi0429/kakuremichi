PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`api_key` text(64) NOT NULL,
	`wireguard_public_key` text(256),
	`virtual_ip` text(15),
	`subnet` text(18) NOT NULL,
	`status` text(16) DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_agents`("id", "name", "api_key", "wireguard_public_key", "virtual_ip", "subnet", "status", "last_seen_at", "metadata", "created_at", "updated_at") SELECT "id", "name", "api_key", "wireguard_public_key", "virtual_ip", "subnet", "status", "last_seen_at", "metadata", "created_at", "updated_at" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `agents_api_key_unique` ON `agents` (`api_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_subnet_unique` ON `agents` (`subnet`);--> statement-breakpoint
CREATE TABLE `__new_gateways` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`api_key` text(64) NOT NULL,
	`public_ip` text(15),
	`wireguard_public_key` text(256),
	`region` text(32),
	`status` text(16) DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_gateways`("id", "name", "api_key", "public_ip", "wireguard_public_key", "region", "status", "last_seen_at", "metadata", "created_at", "updated_at") SELECT "id", "name", "api_key", "public_ip", "wireguard_public_key", "region", "status", "last_seen_at", "metadata", "created_at", "updated_at" FROM `gateways`;--> statement-breakpoint
DROP TABLE `gateways`;--> statement-breakpoint
ALTER TABLE `__new_gateways` RENAME TO `gateways`;--> statement-breakpoint
CREATE UNIQUE INDEX `gateways_api_key_unique` ON `gateways` (`api_key`);