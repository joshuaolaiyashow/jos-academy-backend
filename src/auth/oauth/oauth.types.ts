export const OAUTH_PROVIDERS = ['google', 'linkedin'] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** The subset of standard OpenID Connect claims both providers return. */
export type OAuthProfile = {
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
};

export type OAuthProviderConfig = {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
};

/** Codes the frontend's /auth/callback page turns into a user-facing message. */
export const OAUTH_ERROR_CODES = {
  STATE_MISMATCH: 'OAUTH_STATE_MISMATCH',
  DENIED: 'OAUTH_DENIED',
  PROVIDER_ERROR: 'OAUTH_PROVIDER_ERROR',
  EMAIL_UNVERIFIED: 'OAUTH_EMAIL_UNVERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
} as const;

export type OAuthErrorCode =
  (typeof OAUTH_ERROR_CODES)[keyof typeof OAUTH_ERROR_CODES];

export class OAuthFlowError extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
  }
}
