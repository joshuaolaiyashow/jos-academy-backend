import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const JWKS_PATH = '/protocol/openid-connect/certs';
const DEFAULT_AUDIENCE = 'academy-api';
const VIEW_SUFFIX = ':view';
const MANAGE_SUFFIX = ':manage';

type KeycloakClaims = JWTPayload & {
  resource_access?: Record<string, { roles?: string[] }>;
};

export type WorkspaceIdentity = { id: string; roles: string[] };

let realmKeys: ReturnType<typeof createRemoteJWKSet> | undefined;

// JOS Workspace (Keycloak) tokens count only when KEYCLOAK_ISSUER is set, so a deploy without it keeps the local JWT alone.
export const verifyWorkspaceToken = async (
  token: string,
): Promise<WorkspaceIdentity | null> => {
  const issuer = process.env.KEYCLOAK_ISSUER;
  if (!issuer) return null;
  const audience = process.env.KEYCLOAK_AUDIENCE ?? DEFAULT_AUDIENCE;
  realmKeys ??= createRemoteJWKSet(
    new URL(process.env.KEYCLOAK_JWKS_URL ?? `${issuer}${JWKS_PATH}`),
  );
  try {
    const { payload } = await jwtVerify<KeycloakClaims>(token, realmKeys, {
      issuer,
      audience,
      algorithms: ['RS256'],
    });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      roles: payload.resource_access?.[audience]?.roles ?? [],
    };
  } catch {
    // Any verification failure (bad signature, wrong issuer/audience, expired, a local HS256 JWT) means "not a workspace token".
    return null;
  }
};

export const hasModuleGrant = (
  roles: string[],
  module: string,
  write: boolean,
): boolean =>
  roles.includes(`${module}${MANAGE_SUFFIX}`) ||
  (!write && roles.includes(`${module}${VIEW_SUFFIX}`));
