/** Every audited action. Dotted `<area>.<verb>` so the admin log can filter by prefix. */
export const AUDIT_ACTIONS = {
  AUTH_SIGN_UP: 'auth.sign_up',
  AUTH_SIGN_IN: 'auth.sign_in',
  AUTH_SIGN_IN_FAILED: 'auth.sign_in_failed',
  AUTH_OAUTH_SIGN_IN: 'auth.oauth_sign_in',
  AUTH_SIGN_OUT: 'auth.sign_out',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_REFRESH_TOKEN_REUSED: 'auth.refresh_token_reused',
  COURSE_SUBMITTED_FOR_REVIEW: 'course.submitted_for_review',
  COURSE_REVIEW_STARTED: 'course.review_started',
  COURSE_APPROVED: 'course.approved',
  COURSE_REJECTED: 'course.rejected',
  COHORT_SUBMITTED_FOR_REVIEW: 'cohort.submitted_for_review',
  COHORT_REVIEW_STARTED: 'cohort.review_started',
  COHORT_APPROVED: 'cohort.approved',
  COHORT_CHANGES_REQUESTED: 'cohort.changes_requested',
  ENROLLMENT_TRANSFERRED: 'enrollment.transferred',
  MODULE_DELETED: 'module.deleted',
  MODULE_LESSON_PLAN_CHANGED: 'module.lesson_plan_changed',
  LESSON_DELETED: 'lesson.deleted',
  USER_STATUS_CHANGED: 'user.status_changed',
  USER_ACCOUNT_DELETED: 'user.account_deleted',
  CREATOR_CREATED: 'creator.created',
  DISCOUNT_CAMPAIGN_CREATED: 'discount_campaign.created',
  DISCOUNT_CAMPAIGN_UPDATED: 'discount_campaign.updated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_TARGETS = {
  USER: 'user',
  COURSE: 'course',
  COHORT: 'cohort',
  ENROLLMENT: 'enrollment',
  MODULE: 'module',
  LESSON: 'lesson',
  DISCOUNT_CAMPAIGN: 'discount_campaign',
} as const;

export type AuditTargetType =
  (typeof AUDIT_TARGETS)[keyof typeof AUDIT_TARGETS];
