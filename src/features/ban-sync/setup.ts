import { ephemeral, FeatureError, k, permissions, slash, type Ctx } from 'kuiper';
import { z } from 'zod';
import { SyncBase } from './base.ts';
import { escapeText } from './discord.ts';

const SetupOptions = z.object({
  channel: k.channel({ types: ['GuildText'] }).describe('Channel for ban alerts and sync feedback'),
});
const SourceOptions = z.object({
  source: z.string().regex(/^\d{17,20}$/).describe('ID of the source server to follow or unfollow'),
});

@ephemeral()
export class SyncSetup extends SyncBase {
  @slash('sync setup', { description: 'Set this server\'s moderation log channel', options: SetupOptions })
  @permissions('ManageGuild')
  async setup(ctx: Ctx.Slash<typeof SetupOptions>) {
    const guild = await this.api.guilds.get(ctx.guild.id);
    const channel = await this.api.channels.get(ctx.options.channel.id);
    if (!('guild_id' in channel) || channel.guild_id !== ctx.guild.id) {
      throw new FeatureError('Choose a text channel in this server.');
    }
    await this.send(channel.id, 'Log channel has been set here.');
    await this.repository.configure({ id: guild.id, name: guild.name, channelId: channel.id });
    return ctx.success(`Log channel set to <#${channel.id}>. Use /sync follow to connect a source server.`);
  }

  @slash('sync follow', { description: 'Receive a server\'s alerts and allow its moderators to force-sync bans', options: SourceOptions })
  @permissions('ManageGuild')
  async follow(ctx: Ctx.Slash<typeof SourceOptions>) {
    const sourceId = ctx.options.source;
    if (sourceId === ctx.guild.id) throw new FeatureError('A server cannot follow itself.');
    const [source, target] = await Promise.all([
      this.repository.guild(sourceId), this.repository.guild(ctx.guild.id),
    ]);
    if (!source || !target) throw new FeatureError('Run /sync setup in both servers first.');
    await this.api.guilds.get(sourceId);
    await this.repository.connect(sourceId, ctx.guild.id);
    return ctx.success(`Following ${escapeText(source.name, 100)} (${sourceId}) → this server.`);
  }

  @slash('sync unfollow', { description: 'Stop receiving alerts and force-sync bans from a source', options: SourceOptions })
  @permissions('ManageGuild')
  async unfollow(ctx: Ctx.Slash<typeof SourceOptions>) {
    await this.repository.disconnect(ctx.options.source, ctx.guild.id);
    return ctx.success(`Removed ${ctx.options.source} → this server.`);
  }

  @slash('sync graph', { description: 'Show this server\'s incoming and outgoing sync connections' })
  @permissions('ManageGuild')
  async graph(ctx: Ctx.Slash) {
    const edges = await this.repository.connections(ctx.guild.id);
    if (!edges.length) return 'This server has no sync connections. Use /sync follow to add a source.';
    const lines = edges.slice(0, 60).map((edge) => `${edge.sourceId} → ${edge.targetId}`);
    if (edges.length > 60) lines.push(`...and ${edges.length - 60} more`);
    return `**Connections** (source → recipient)\n${lines.join('\n')}`;
  }
}
