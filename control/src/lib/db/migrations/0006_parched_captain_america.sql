ALTER TABLE `tunnels` ADD `http_proxy_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tunnels` ADD `socks_proxy_enabled` integer DEFAULT false NOT NULL;