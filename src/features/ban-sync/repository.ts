import { randomUUID } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import type { FeatureDb } from 'kuiper/storage';
import * as schema from './schema.ts';
import type { BanEvent, EventKind, GuildSettings } from './types.ts';

export class SyncRepository {
  constructor(private readonly db: FeatureDb<typeof schema>) {}

  async guild(id: string) {
    const [guild] = await this.db.select().from(schema.guilds).where(eq(schema.guilds.id, id));
    return guild;
  }

  async configure(guild: GuildSettings) {
    await this.db.insert(schema.guilds).values(guild).onConflictDoUpdate({
      target: schema.guilds.id,
      set: { name: guild.name, channelId: guild.channelId },
    });
  }

  async connect(sourceId: string, targetId: string) {
    await this.db.insert(schema.edges).values({ sourceId, targetId }).onConflictDoNothing();
  }

  async disconnect(sourceId: string, targetId: string) {
    await this.db.delete(schema.edges).where(and(
      eq(schema.edges.sourceId, sourceId), eq(schema.edges.targetId, targetId),
    ));
  }

  async connections(guildId: string) {
    return this.db.select().from(schema.edges).where(or(
      eq(schema.edges.sourceId, guildId), eq(schema.edges.targetId, guildId),
    ));
  }

  async targets(sourceId: string): Promise<GuildSettings[]> {
    const rows = await this.db.select({ guild: schema.guilds }).from(schema.edges)
      .innerJoin(schema.guilds, eq(schema.guilds.id, schema.edges.targetId))
      .where(eq(schema.edges.sourceId, sourceId));
    return rows.map((row) => row.guild);
  }

  async connected(sourceId: string, targetId: string) {
    const [edge] = await this.db.select().from(schema.edges).where(and(
      eq(schema.edges.sourceId, sourceId), eq(schema.edges.targetId, targetId),
    ));
    return edge !== undefined;
  }

  async event(id: string) {
    const [event] = await this.db.select().from(schema.events).where(eq(schema.events.id, id));
    return event;
  }

  async invalidate(sourceId: string, userId: string) {
    await this.db.update(schema.events).set({ active: false }).where(and(
      eq(schema.events.sourceId, sourceId), eq(schema.events.userId, userId),
    ));
  }

  async record(input: Omit<BanEvent, 'id' | 'active' | 'createdAt'>) {
    return this.db.transaction(async (transaction) => {
      const condition = and(
        eq(schema.events.sourceId, input.sourceId), eq(schema.events.userId, input.userId),
        eq(schema.events.active, true),
      );
      const [previous] = await transaction.select().from(schema.events).where(condition);
      if (previous?.kind === input.kind) {
        const sameAudit = input.auditId !== null && input.auditId === previous.auditId;
        const recentWithoutAudit = input.auditId === null && previous.auditId === null
          && Date.now() - previous.createdAt.getTime() < 5_000;
        if (sameAudit || recentWithoutAudit) return undefined;
      }
      await transaction.update(schema.events).set({ active: false }).where(condition);
      const event: BanEvent = { ...input, id: randomUUID(), active: true, createdAt: new Date() };
      await transaction.insert(schema.events).values(event);
      return event;
    });
  }

  async expectEcho(guildId: string, userId: string, kind: EventKind, token: string) {
    const values = { guildId, userId, kind, token, expiresAt: new Date(Date.now() + 60_000) };
    await this.db.insert(schema.echoes).values(values).onConflictDoUpdate({
      target: [schema.echoes.guildId, schema.echoes.userId, schema.echoes.kind], set: values,
    });
  }

  async expectedEcho(guildId: string, userId: string, kind: EventKind) {
    const [echo] = await this.db.select().from(schema.echoes).where(and(
      eq(schema.echoes.guildId, guildId), eq(schema.echoes.userId, userId), eq(schema.echoes.kind, kind),
    ));
    return echo;
  }

  async clearEcho(guildId: string, userId: string, kind: EventKind) {
    await this.db.delete(schema.echoes).where(and(
      eq(schema.echoes.guildId, guildId), eq(schema.echoes.userId, userId), eq(schema.echoes.kind, kind),
    ));
  }
}
