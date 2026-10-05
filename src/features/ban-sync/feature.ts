import { button, Events, FeatureError, on, permissions, type Ctx, type Reply } from 'kuiper';
import type { GatewayGuildBanAddDispatchData } from 'discord-api-types/v10';
import { ForceSync, Sync } from './actions.ts';
import { findAuditEntry } from './discord.ts';
import { eventMessage } from './messages.ts';
import { SyncService } from './service.ts';
import { SyncSetup } from './setup.ts';
import type { EventKind } from './types.ts';

export class BanSync extends SyncSetup {
  private currentBotId?: Promise<string>;

  private get service() {
    return new SyncService(this.repository, this.api, this.queue,
      (guildId, reply) => this.sendToGuild(guildId, reply), this.log, this.t);
  }

  @on(Events.GuildBanAdd)
  async banned(ctx: Ctx.Gateway<Events.GuildBanAdd>) {
    await this.observe(ctx.data, 'ban');
  }

  @on(Events.GuildBanRemove)
  async unbanned(ctx: Ctx.Gateway<Events.GuildBanRemove>) {
    await this.observe(ctx.data, 'unban');
  }

  @button(Sync)
  @permissions('BanMembers')
  async sync(ctx: Ctx.Button<typeof Sync>) {
    await ctx.defer({ ephemeral: true });
    return this.service.synchronize(ctx.state.id, ctx.guild.id, ctx.user.id, false);
  }

  @button(ForceSync)
  @permissions('BanMembers')
  async forceSync(ctx: Ctx.Button<typeof ForceSync>) {
    await ctx.defer({ ephemeral: true });
    const event = await this.service.validate(ctx.state.id, ctx.guild.id, true);
    const targets = (await this.repository.targets(event.sourceId))
      .filter((target) => event.recipientIds.includes(target.id));
    if (!targets.length) throw new FeatureError('There are no connected recipients for this alert.');
    if ((await this.kv.forceConfirmedUntil.get() ?? 0) <= Date.now()) {
      const confirmed = await ctx.confirm(this.t.forceConfirmation({ userId: event.userId, targetCount: targets.length }));
      if (!confirmed) return this.t.forceCancelled();
      await this.kv.forceConfirmedUntil.set(Date.now() + 5 * 60_000);
    }
    return this.service.synchronize(ctx.state.id, ctx.guild.id, ctx.user.id, true);
  }

  private async observe(data: GatewayGuildBanAddDispatchData, kind: EventKind) {
    await this.queue.run(`${data.guild_id}:${data.user.id}`, async () => {
      const source = await this.repository.guild(data.guild_id);
      if (!source) return;
      const audit = await findAuditEntry(this.api, source.id, data.user.id, kind);
      const echo = await this.repository.expectedEcho(source.id, data.user.id, kind);
      let isEcho = !audit && echo !== undefined && echo.expiresAt.getTime() > Date.now();
      if (audit?.reason?.startsWith('[Pascal:')) {
        this.currentBotId ??= this.api.users.getCurrent().then((user) => user.id).catch((error: unknown) => {
          this.currentBotId = undefined;
          throw error;
        });
        isEcho = audit.user_id === await this.currentBotId;
      }
      if (isEcho) {
        await this.repository.invalidate(source.id, data.user.id);
        return;
      }
      await this.repository.clearEcho(source.id, data.user.id, kind);
      let reason = audit?.reason;
      if (!reason && kind === 'ban') {
        try {
          reason = (await this.api.guilds.getMemberBan(source.id, data.user.id)).reason ?? undefined;
        } catch (error) {
          this.log.warn('Could not fetch ban reason', { guildId: source.id, userId: data.user.id, error });
        }
      }
      const targets = await this.repository.targets(source.id);
      const event = await this.repository.record({
        sourceId: source.id, sourceName: source.name, userId: data.user.id,
        username: data.user.global_name ? `${data.user.global_name} (@${data.user.username})` : data.user.username,
        reason: reason || 'No reason provided (or audit log unavailable).',
        auditId: audit?.id ?? null,
        kind, recipientIds: targets.map((target) => target.id),
      });
      if (!event) return;
      await this.sendToGuild(source.id, eventMessage(this.t, event, true));
      for (const target of targets) await this.sendToGuild(target.id, eventMessage(this.t, event, false));
    });
  }

  private async sendToGuild(guildId: string, reply: Reply): Promise<boolean> {
    try {
      const guild = await this.repository.guild(guildId);
      if (!guild) return false;
      await this.inGuild(guildId, () => this.send(guild.channelId, reply, { allowedMentions: { parse: [] } }));
      return true;
    } catch (error) {
      this.log.error('Could not deliver moderation message', { guildId, error });
      return false;
    }
  }
}
