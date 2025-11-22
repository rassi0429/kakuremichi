import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const gateways = sqliteTable('gateways', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name', { length: 64 }).notNull(),
  apiKey: text('api_key', { length: 64 }).notNull().unique(),
  publicIp: text('public_ip', { length: 15 }),
  wireguardPublicKey: text('wireguard_public_key', { length: 256 }),
  region: text('region', { length: 32 }),
  status: text('status', { length: 16 }).notNull().default('offline'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Gateway = typeof gateways.$inferSelect;
export type NewGateway = typeof gateways.$inferInsert;
