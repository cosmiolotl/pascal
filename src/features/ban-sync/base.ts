import { feature } from 'kuiper';
import { kv } from 'kuiper/storage';
import { z } from 'zod';
import { SyncRepository } from './repository.ts';
import { KeyedQueue } from './queue.ts';
import * as schema from './schema.ts';
import { templates } from './templates.tsx';

export class SyncBase extends feature('ban-sync', {
  schema,
  templates,
  migrations: new URL('./migrations', import.meta.url),
  kv: { forceConfirmedUntil: kv({ scope: 'user', value: z.number(), ttl: '5m' }) },
}) {
  protected readonly queue = new KeyedQueue();

  protected get repository() {
    return new SyncRepository(this.db);
  }
}
