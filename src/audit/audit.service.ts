import { Injectable, Logger } from '@nestjs/common';

import { Prisma, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageMeta, toPrismaPage } from '../utils/pagination';
import type { AuditAction, AuditTargetType } from './audit-actions';
import { auditRequestStorage } from './audit-context';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

const USER_AGENT_MAX_LENGTH = 512;

type AuditEntry = {
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  /** Reasons, old/new values. Callers must never pass tokens, passwords or emails. */
  metadata?: Prisma.InputJsonObject;
  /** Needed when nobody is signed in yet (sign-in, reset); defaults to the request's user. */
  actor?: { id: string; role?: UserRole };
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Awaited by callers so the entry is written before the response goes out. A write
   * failure is logged loudly but doesn't undo or fail the action it describes.
   */
  async record({
    action,
    targetType,
    targetId,
    metadata,
    actor,
  }: AuditEntry): Promise<void> {
    const request = auditRequestStorage.getStore();
    const actorId = actor?.id ?? request?.user?.id ?? null;
    const actorRole = actor?.role ?? request?.user?.role ?? null;

    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          actorId,
          actorRole,
          targetType,
          targetId,
          metadata,
          ip: request?.ip ?? null,
          userAgent:
            request?.get('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Could not write audit entry "${action}" for actor ${actorId ?? 'anonymous'}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list({
    action,
    actorId,
    targetType,
    targetId,
    from,
    to,
    ...pageParams
  }: ListAuditLogsQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      action,
      actorId,
      targetType,
      targetId,
      createdAt:
        from || to
          ? {
              gte: from ? new Date(from) : undefined,
              lte: to ? new Date(to) : undefined,
            }
          : undefined,
    };

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toPrismaPage(pageParams),
      }),
    ]);

    // Actors are looked up rather than joined: entries have no FK so they outlive deleted users.
    const actorIds = [
      ...new Set(
        entries.flatMap((entry) => (entry.actorId ? [entry.actorId] : [])),
      ),
    ];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const actorNames = new Map(actors.map((user) => [user.id, user.name]));

    return {
      ...pageMeta(total, pageParams),
      entries: entries.map((entry) => ({
        ...entry,
        actorName: entry.actorId
          ? (actorNames.get(entry.actorId) ?? null)
          : null,
      })),
    };
  }
}
