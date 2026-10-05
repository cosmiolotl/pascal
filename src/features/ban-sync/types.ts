import type { events, guilds } from './schema.ts';

export type BanEvent = typeof events.$inferSelect;
export type GuildSettings = typeof guilds.$inferSelect;
export type EventKind = BanEvent['kind'];

export interface SyncResult {
  guildId: string;
  guildName: string;
  status: 'synced' | 'unchanged' | 'failed' | 'disconnected';
  detail: string;
}
