import { randomUUID } from 'node:crypto';
import type { API } from '@discordjs/core';
import { FeatureError, type Logger, type Reply } from 'kuiper';
import { failureReason, isBanned } from './discord.ts';
import { feedbackMessage, resultSummary } from './messages.ts';
import type { SyncBase } from './base.ts';
import type { KeyedQueue } from './queue.ts';
import type { SyncRepository } from './repository.ts';
import type { BanEvent, SyncResult } from './types.ts';

type SendToGuild = (guildId: string, reply: Reply) => Promise<boolean>;

export class SyncService {
  constructor(
    private readonly repository: SyncRepository,
    private readonly api: API,
    private readonly queue: KeyedQueue,
    private readonly send: SendToGuild,
    private readonly log: Logger,
    private readonly templates: SyncBase['t'],
  ) {}

  async validate(eventId: string, guildId: string, forced: boolean) {
    const event = await this.repository.event(eventId);
    if (!event?.active) throw new FeatureError('This alert is outdated. Use the latest ban or unban alert.');
    if (forced) {
      if (event.kind !== 'ban' || guildId !== event.sourceId) {
        throw new FeatureError('Only the source server can force-sync a ban.');
      }
    } else if (guildId === event.sourceId || !event.recipientIds.includes(guildId)
      || !(await this.repository.connected(event.sourceId, guildId))) {
      throw new FeatureError('This server no longer follows the source of this alert.');
    }
    if (!(await this.repository.guild(guildId))) {
      throw new FeatureError('Run /sync setup in this server first.');
    }
    const banned = await isBanned(this.api, event.sourceId, event.userId);
    if (banned !== (event.kind === 'ban')) {
      await this.repository.invalidate(event.sourceId, event.userId);
      throw new FeatureError('The user\'s ban status in the source server has changed.');
    }
    return event;
  }

  async synchronize(eventId: string, guildId: string, actorId: string, forced: boolean) {
    const event = await this.validate(eventId, guildId, forced);
    const targets = forced
      ? (await this.repository.targets(event.sourceId)).filter((target) => event.recipientIds.includes(target.id))
      : [await this.repository.guild(guildId)].filter((target) => target !== undefined);
    if (!targets.length) throw new FeatureError('There are no connected recipients for this alert.');
    const results: SyncResult[] = [];
    let failedDeliveries = 0;
    for (const target of targets) {
      const result = await this.queue.run(`${target.id}:${event.userId}`, async () => {
        try {
          await this.validate(eventId, guildId, forced);
          return await this.apply(event, target.id, target.name, actorId, forced);
        } catch (error) {
          this.log.error('Synchronization failed', { eventId, targetId: target.id, error });
          return {
            guildId: target.id, guildName: target.name, status: 'failed' as const,
            detail: error instanceof FeatureError ? error.message : failureReason(error),
          };
        }
      });
      results.push(result);
      const message = feedbackMessage(this.templates, event, actorId, forced, result);
      for (const recipientId of new Set([event.sourceId, target.id])) {
        if (!(await this.send(recipientId, message))) failedDeliveries++;
      }
    }
    return resultSummary(this.templates, results, failedDeliveries);
  }

  private async apply(event: BanEvent, targetId: string, targetName: string, actorId: string, forced: boolean): Promise<SyncResult> {
    const base = { guildId: targetId, guildName: targetName };
    if (!(await this.repository.connected(event.sourceId, targetId))) {
      return { ...base, status: 'disconnected', detail: 'The connection was removed before this sync ran.' };
    }
    if (await isBanned(this.api, targetId, event.userId) === (event.kind === 'ban')) {
      return { ...base, status: 'unchanged', detail: `The user is already ${event.kind === 'ban' ? 'banned' : 'unbanned'} here.` };
    }
    const token = randomUUID();
    const reason = `[Pascal:${token}] ${forced ? 'Force sync' : 'Sync'} ${event.kind} from `
      + `${event.sourceId} by ${actorId}: ${event.reason}`;
    await this.repository.expectEcho(targetId, event.userId, event.kind, token);
    try {
      if (event.kind === 'ban') {
        await this.api.guilds.banUser(targetId, event.userId, { delete_message_seconds: 0 }, { reason: reason.slice(0, 512) });
      } else {
        await this.api.guilds.unbanUser(targetId, event.userId, { reason: reason.slice(0, 512) });
      }
    } catch (error) {
      await this.repository.clearEcho(targetId, event.userId, event.kind);
      throw error;
    }
    await this.repository.invalidate(targetId, event.userId);
    return { ...base, status: 'synced', detail: `The user was ${event.kind === 'ban' ? 'banned' : 'unbanned'} successfully.` };
  }
}
