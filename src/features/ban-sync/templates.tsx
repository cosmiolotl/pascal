import { bind, fmt, template, type Recorded, type Ref } from 'kuiper';
import { Button, Container, Else, If, Row, Separator, Text } from 'kuiper/jsx';
import { z } from 'zod';
import { ForceSync, Sync } from './actions.ts';

const eventSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  username: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  reason: z.string(),
});
const eventVars = z.object({ event: eventSchema });
const eventPreview: z.input<typeof eventSchema> = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: '300000000000000001',
  username: 'example',
  sourceId: '100000000000000001',
  sourceName: 'Server A',
  reason: 'Repeated spam',
};
const noMentions = { users: false, roles: false, everyone: false };
const eventSpec = { vars: eventVars, preview: { event: eventPreview }, allowMentions: noMentions };
const syncAction = bind(Sync, (vars: z.output<typeof eventVars>) => ({ id: vars.event.id })).required();
const forceAction = bind(ForceSync, (vars: z.output<typeof eventVars>) => ({ id: vars.event.id })).required();

function EventDetails({ event, verb }: {
  event: Recorded<z.output<typeof eventSchema>>;
  verb: 'banned' | 'unbanned' | Ref<'banned' | 'unbanned'>;
}) {
  return (
    <>
      <Text>
        {fmt.mention(event.userId)} was {verb} in {fmt.truncate(event.sourceName, 100)}{'\n'}
        -# {fmt.truncate(event.username, 100)} - {event.userId}
      </Text>
      <Separator />
      <Text>{fmt.truncate(event.reason, 1_000)}</Text>
    </>
  );
}

export const templates = {
  sourceBan: template({ ...eventSpec, actions: { force: forceAction } }, ({ v, a, theme }) => (
    <Container accent={theme.danger}>
      <EventDetails event={v.event} verb="banned" />
      <Row><Button action={a.force} style="danger">Force Sync Ban</Button></Row>
    </Container>
  )),
  recipientBan: template({ ...eventSpec, actions: { sync: syncAction } }, ({ v, a, theme }) => (
    <Container accent={theme.danger}>
      <EventDetails event={v.event} verb="banned" />
      <Row><Button action={a.sync} style="primary">Sync Ban</Button></Row>
    </Container>
  )),
  sourceUnban: template(eventSpec, ({ v, theme }) => (
    <Container accent={theme.success}><EventDetails event={v.event} verb="unbanned" /></Container>
  )),
  recipientUnban: template({ ...eventSpec, actions: { sync: syncAction } }, ({ v, a, theme }) => (
    <Container accent={theme.success}>
      <EventDetails event={v.event} verb="unbanned" />
      <Row><Button action={a.sync} style="primary">Sync Unban</Button></Row>
    </Container>
  )),
  syncFeedback: template({
    vars: eventVars.extend({
      actorId: z.string(),
      action: z.enum(['banned', 'unbanned']),
      mode: z.enum(['Force sync ban', 'Sync ban', 'Sync unban']),
      kind: z.enum(['ban', 'unban']),
      syncStatus: z.enum(['synced', 'force synced']),
      succeeded: z.boolean(),
      result: z.object({
        guildId: z.string(), guildName: z.string(),
        status: z.enum(['synced', 'unchanged', 'failed', 'disconnected']), detail: z.string(),
      }),
    }),
    preview: {
      event: eventPreview, actorId: '300000000000000002', action: 'banned', mode: 'Sync ban',
      kind: 'ban', syncStatus: 'synced', succeeded: true,
      result: { guildId: '100000000000000002', guildName: 'Server B', status: 'synced', detail: 'The user was banned successfully.' },
    },
    allowMentions: noMentions,
  }, ({ v, theme }) => (
    <Container accent={theme.accent}>
      <If when={v.succeeded}>
        <Text>
          {v.kind} for {fmt.mention(v.event.userId)} was {v.syncStatus} by {fmt.mention(v.actorId)}{'\n'}
          -# {fmt.truncate(v.event.username, 100)} - {v.event.userId}
        </Text>
        <Else>
          <EventDetails event={v.event} verb={v.action} />
          <Text>
            **{v.mode}: {v.result.status}**{'\n'}
            **Destination:** {fmt.truncate(v.result.guildName, 100)} ({v.result.guildId}){'\n'}
            **Requested by:** {fmt.mention(v.actorId)}{'\n'}
            {fmt.truncate(v.result.detail, 350)}
          </Text>
        </Else>
      </If>
    </Container>
  )),
  forceConfirmation: template({
    vars: z.object({ userId: z.string(), targetCount: z.number().int().positive() }),
    preview: { userId: eventPreview.userId, targetCount: 2 },
    allowMentions: noMentions,
  }, ({ v }) => (
    <Text>
      Force-sync the ban of {fmt.mention(v.userId)} ({v.userId}) to {v.targetCount} directly connected server(s)?{' '}
      This bans the user without a local moderator's approval.{' '}
    </Text>
  )),
  forceCancelled: template({ preview: {} }, () => <Text>Force sync cancelled. No bans were synchronized.</Text>),
  syncSummary: template({
    vars: z.object({
      synced: z.number().int().nonnegative(), unchanged: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(), disconnected: z.number().int().nonnegative(),
      failedDeliveries: z.number().int().nonnegative(),
    }),
    preview: { synced: 2, unchanged: 1, failed: 0, disconnected: 0, failedDeliveries: 1 },
  }, ({ v }) => (
    <>
      <Text>
        Completed | {v.synced} synced, {v.unchanged} unchanged, {v.failed} failed
      </Text>
      <If when={v.failedDeliveries}>
        <Text>{v.failedDeliveries} feedback message(s) could not be delivered.</Text>
      </If>
    </>
  )),
};
