import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name', { length: 64 }).notNull(),
  apiKey: text('api_key', { length: 64 }).notNull().unique(),
  wireguardPublicKey: text('wireguard_public_key', { length: 256 }).notNull().unique(),
  wireguardPrivateKey: text('wireguard_private_key', { length: 256 }),
  virtualIp: text('virtual_ip', { length: 15 }).notNull().unique(),
  subnet: text('subnet', { length: 18 }).notNull().unique(),
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

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
