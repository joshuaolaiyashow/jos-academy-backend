const DAY_MS = 24 * 60 * 60 * 1000;

export const CLIENT_TYPES = ['web', 'mobile'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

/**
 * Web keeps its refresh token in localStorage, so it gets a short life; the
 * mobile app stores it in the device keychain (expo-secure-store).
 */
export const REFRESH_TOKEN_TTL_DAYS: Record<ClientType, number> = {
  web: 7,
  mobile: 30,
};

export const refreshTokenTtlMs = (clientType: ClientType): number =>
  REFRESH_TOKEN_TTL_DAYS[clientType] * DAY_MS;

/**
 * Two browser tabs share one stored refresh token and may both use it within
 * moments of each other. Reuse inside this window is treated as that benign
 * race; reuse after it is treated as a stolen token.
 */
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;

export const AUTH_ERROR_CODES = {
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
} as const;
