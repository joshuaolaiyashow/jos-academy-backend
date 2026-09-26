import type { CookieOptions, Request } from 'express';

export const OAUTH_STATE_COOKIE = 'josa_oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * SameSite=Lax still sends the cookie on the provider's top-level redirect
 * back to the callback, while blocking it on cross-site sub-requests.
 */
export const oauthStateCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: (process.env.API_BASE_URL ?? '').startsWith('https://'),
  sameSite: 'lax',
  path: '/auth/oauth',
  maxAge: OAUTH_STATE_TTL_MS,
});

export const readOAuthStateCookie = (request: Request): string | undefined => {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === OAUTH_STATE_COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
};
