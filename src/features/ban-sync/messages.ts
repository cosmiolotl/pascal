import type { SyncBase } from './base.ts';
import type { BanEvent, SyncResult } from './types.ts';

export function eventMessage(templates: SyncBase['t'], event: BanEvent, isSource: boolean) {
  if (event.kind === 'ban') {
    return isSource ? templates.sourceBan({ event }) : templates.recipientBan({ event });
  }
  return isSource ? templates.sourceUnban({ event }) : templates.recipientUnban({ event });
}

export function feedbackMessage(templates: SyncBase['t'], event: BanEvent, actorId: string, forced: boolean, result: SyncResult) {
  const mode = forced ? 'Force sync ban' : `Sync ${event.kind}` as const;
  const action = event.kind === 'ban' ? 'banned' : 'unbanned';
  return templates.syncFeedback({
    event, actorId, action, mode, result, kind: event.kind,
    syncStatus: forced ? 'force synced' : 'synced',
    succeeded: result.status === 'synced',
  });
}

export function resultSummary(templates: SyncBase['t'], results: SyncResult[], failedDeliveries: number) {
  const count = (status: SyncResult['status']) => results.filter((result) => result.status === status).length;
  return templates.syncSummary({
    synced: count('synced'), unchanged: count('unchanged'), failed: count('failed'),
    disconnected: count('disconnected'), failedDeliveries,
  });
}
