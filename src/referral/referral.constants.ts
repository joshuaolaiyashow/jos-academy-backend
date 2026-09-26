/** A referred user's one-time discount on their first purchase (credits or a program). */
export const REFERRAL_DISCOUNT_PERCENT = 5;

/** Paid referrals shown as a goal on the Rewards tab. No reward is attached yet. */
export const REFERRAL_GOAL = 10;

export const REFERRAL_STATUS = {
  PAID: 'PAID',
  PENDING: 'PENDING',
} as const;

export type ReferralStatus =
  (typeof REFERRAL_STATUS)[keyof typeof REFERRAL_STATUS];
