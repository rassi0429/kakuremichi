import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { tunnels } from './tunnels';
import { gateways } from './gateways';

/**
 * Mapping table for Gateway IPs per Tunnel
 * Each Gateway gets a unique IP within each Tunnel's subnet
 * Gateway IPs are allocated from the back (.254, .253, .252, ...)
 */
export const tunnelGatewayIps = sqliteTable('tunnel_gateway_ips', {
  tunnelId: text('tunnel_id').notNull().references(() => tunnels.id, { onDelete: 'cascade' }),
  gatewayId: text('gateway_id').notNull().references(() => gateways.id, { onDelete: 'cascade' }),
  ip: text('ip', { length: 15 }).notNull(), // e.g., "10.1.0.254"
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  pk: primaryKey({ columns: [table.tunnelId, table.gatewayId] }),
}));

export type TunnelGatewayIp = typeof tunnelGatewayIps.$inferSelect;
export type NewTunnelGatewayIp = typeof tunnelGatewayIps.$inferInsert;
