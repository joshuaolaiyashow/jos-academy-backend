import {
  OAUTH_PROVIDERS,
  OAuthProvider,
  OAuthProviderConfig,
} from './oauth.types';

type ProviderEndpoints = Omit<
  OAuthProviderConfig,
  'provider' | 'clientId' | 'clientSecret'
> & { clientIdEnv: string; clientSecretEnv: string };

const PROVIDER_ENDPOINTS: Record<OAuthProvider, ProviderEndpoints> = {
  google: {
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  linkedin: {
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    scope: 'openid profile email',
  },
};

export const isOAuthProvider = (value: string): value is OAuthProvider =>
  (OAUTH_PROVIDERS as readonly string[]).includes(value);

/** A provider is enabled only when both its client ID and secret are set. */
export const getProviderConfig = (
  provider: OAuthProvider,
): OAuthProviderConfig | null => {
  const { clientIdEnv, clientSecretEnv, ...endpoints } =
    PROVIDER_ENDPOINTS[provider];
  const clientId = process.env[clientIdEnv];
  const clientSecret = process.env[clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { provider, clientId, clientSecret, ...endpoints };
};

export const getEnabledProviders = (): OAuthProvider[] =>
  OAUTH_PROVIDERS.filter((provider) => getProviderConfig(provider) !== null);
