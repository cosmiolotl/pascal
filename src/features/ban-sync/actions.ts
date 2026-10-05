import { action } from 'kuiper';
import { z } from 'zod';

const state = z.object({ id: z.uuid() });

export const Sync = action('ban-sync.sync', { state });
export const ForceSync = action('ban-sync.force', { state });
