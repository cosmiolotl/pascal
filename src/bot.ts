import { join } from 'node:path';
import { Kuiper } from 'kuiper';
import { pglite, postgres } from 'kuiper/storage';
import { BanSync } from './features/ban-sync/feature.ts';
import { PGliteSocketStorage } from './storage/pglite-socket.ts';

function storage() {
  if (process.env.DATABASE_URL) return postgres(process.env.DATABASE_URL);
  const dataDir = join(import.meta.dirname, '../.data/pglite');
  if (process.env.PGLITE_SOCKET_PATH) return new PGliteSocketStorage(dataDir, process.env.PGLITE_SOCKET_PATH);
  return pglite(dataDir);
}

export const bot = new Kuiper({
  token: process.env.DISCORD_TOKEN ?? '',
  commands: { guildId: process.env.DEV_GUILD_ID || undefined },
  storage: { sql: storage() },
}).use(BanSync);
