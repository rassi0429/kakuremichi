import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';

export const tunnels = sqliteTable('tunnels', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain', { length: 255 }).notNull().unique(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  target: text('target', { length: 255 }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  description: text('description'),
  // Network configuration (assigned automatically on tunnel creation)
  subnet: text('subnet', { length: 18 }),      // e.g., "10.1.0.0/24"
  agentIp: text('agent_ip', { length: 15 }),   // e.g., "10.1.0.2" (from front)
  // Note: Gateway IPs are now stored in tunnel_gateway_ips table (multiple gateways per tunnel)
  // Exit Node (Outbound Proxy) settings
  httpProxyEnabled: integer('http_proxy_enabled', { mode: 'boolean' }).notNull().default(false),
  socksProxyEnabled: integer('socks_proxy_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Tunnel = typeof tunnels.$inferSelect;
export type NewTunnel = typeof tunnels.$inferInsert;
