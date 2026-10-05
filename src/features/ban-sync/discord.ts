import { setTimeout as sleep } from 'node:timers/promises';
import type { API } from '@discordjs/core';
import { AuditLogEvent } from 'discord-api-types/v10';
import type { EventKind } from './types.ts';

export function discordErrorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'number' ? error.code : undefined;
}

export function failureReason(error: unknown): string {
  const code = discordErrorCode(error);
  if (code === 50013) return 'Missing Ban Members permission or the target outranks the bot.';
  if (code === 50001) return 'The bot cannot access this server or channel.';
  if (code === 10004) return 'The bot is no longer in this server.';
  if (code === 10003) return 'The configured log channel was deleted.';
  return 'Discord could not complete the request. Check the bot logs and try again.';
}

export async function isBanned(api: API, guildId: string, userId: string): Promise<boolean> {
  try {
    await api.guilds.getMemberBan(guildId, userId);
    return true;
  } catch (error) {
    if (discordErrorCode(error) === 10026) return false;
    throw error;
  }
}

export async function findAuditEntry(api: API, guildId: string, userId: string, kind: EventKind) {
  const action = kind === 'ban' ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberBanRemove;
  const since = Date.now() - 20_000;
  // Ban gateway events can precede their audit entry; retry briefly instead of attaching an old reason.
  for (const delay of [0, 400, 1_000]) {
    if (delay) await sleep(delay);
    try {
      const audit = await api.guilds.getAuditLogs(guildId, { action_type: action, limit: 10 });
      const entry = audit.audit_log_entries.find((candidate) => {
        const createdAt = Number((BigInt(candidate.id) >> 22n) + 1420070400000n);
        return candidate.target_id === userId && candidate.action_type === action && createdAt >= since;
      });
      if (entry) return entry;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function escapeText(value: string, maxLength = 1_000): string {
  return value.slice(0, maxLength).replace(/[\\`*_{}\[\]()<>#+\-.!|~]/g, '\\$&');
}
