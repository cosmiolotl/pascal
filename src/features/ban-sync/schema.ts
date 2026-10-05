import { boolean, index, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { featureSchema } from 'kuiper/storage';

const schema = featureSchema('ban-sync');

export const guilds = schema.table('guilds', {
  id: text().primaryKey(),
  name: text().notNull(),
  channelId: text().notNull(),
});

export const edges = schema.table('edges', {
  sourceId: text().notNull().references(() => guilds.id, { onDelete: 'cascade' }),
  targetId: text().notNull().references(() => guilds.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.sourceId, table.targetId] })]);

export const events = schema.table('events', {
  id: uuid().primaryKey(),
  sourceId: text().notNull(),
  sourceName: text().notNull(),
  userId: text().notNull(),
  username: text().notNull(),
  kind: text().$type<'ban' | 'unban'>().notNull(),
  reason: text().notNull(),
  auditId: text(),
  recipientIds: jsonb().$type<string[]>().notNull(),
  active: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [index().on(table.sourceId, table.userId, table.active)]);

export const echoes = schema.table('echoes', {
  guildId: text().notNull(),
  userId: text().notNull(),
  kind: text().$type<'ban' | 'unban'>().notNull(),
  token: uuid().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.guildId, table.userId, table.kind] })]);
