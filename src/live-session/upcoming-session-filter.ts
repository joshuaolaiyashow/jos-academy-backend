import { LiveSessionStatus, Prisma } from '../generated/prisma/client';

/**
 * Sessions a learner should still see: scheduled ones that haven't started,
 * plus any whose waiting room is open or that are live (even past their start time).
 */
export const UPCOMING_OR_LIVE_SESSION_FILTER =
  (): Prisma.LiveSessionWhereInput => ({
    OR: [
      {
        status: LiveSessionStatus.SCHEDULED,
        scheduledAt: { gte: new Date() },
      },
      {
        status: { in: [LiveSessionStatus.WAITING, LiveSessionStatus.LIVE] },
      },
    ],
  });
