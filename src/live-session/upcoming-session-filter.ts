import { LiveSessionStatus, Prisma } from '../generated/prisma/client';

/**
 * Sessions a learner should still see: scheduled ones that haven't started,
 * plus any the host has taken live (even though their start time has passed).
 */
export const UPCOMING_OR_LIVE_SESSION_FILTER =
  (): Prisma.LiveSessionWhereInput => ({
    OR: [
      {
        status: LiveSessionStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
      },
      { status: LiveSessionStatus.LIVE },
    ],
  });
