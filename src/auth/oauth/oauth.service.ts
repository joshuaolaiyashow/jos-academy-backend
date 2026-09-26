import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_ACTIONS, AUDIT_TARGETS } from '../../audit/audit-actions';
import { AuthService } from '../auth.service';
import { UserRole, VerificationType } from '../../generated/prisma/client';
import { generateReferralCode } from '../../utils';
import { OAuthProviderClient } from './oauth-provider.client';
import { getProviderConfig, isOAuthProvider } from './oauth-providers.config';
import {
  OAUTH_ERROR_CODES,
  OAuthFlowError,
  OAuthProfile,
  OAuthProvider,
  OAuthProviderConfig,
} from './oauth.types';

const STATE_BYTES = 32;
const EXCHANGE_CODE_BYTES = 32;
const EXCHANGE_CODE_TTL_MS = 60 * 1000;
const PASSWORD_HASH_ROUNDS = 12;
const FRONTEND_CALLBACK_PATH = '/auth/callback';

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** OAuth-only accounts get an unguessable password; "Forgot password" sets a real one. */
const unusablePasswordHash = (): Promise<string> =>
  bcrypt.hash(randomBytes(32).toString('hex'), PASSWORD_HASH_ROUNDS);

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly providerClient: OAuthProviderClient,
    private readonly audit: AuditService,
  ) {}

  getConfigOrThrow(provider: string): OAuthProviderConfig {
    const config = isOAuthProvider(provider)
      ? getProviderConfig(provider)
      : null;
    if (!config) {
      throw new NotFoundException('This sign-in provider is not available.');
    }
    return config;
  }

  private redirectUri(provider: OAuthProvider): string {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4001';
    return `${apiBaseUrl}/auth/oauth/${provider}/callback`;
  }

  frontendCallbackUrl(params: Record<string, string>): string {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return `${appUrl}${FRONTEND_CALLBACK_PATH}?${new URLSearchParams(params).toString()}`;
  }

  /** Returns the provider consent URL and the state the caller must bind to a cookie. */
  startSignIn(config: OAuthProviderConfig) {
    const state = randomBytes(STATE_BYTES).toString('hex');
    const url = new URL(config.authorizeUrl);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: this.redirectUri(config.provider),
      scope: config.scope,
      state,
      prompt: 'select_account',
    }).toString();
    return { url: url.toString(), state };
  }

  /**
   * Completes the provider round-trip and returns where to send the browser:
   * the frontend callback with either a single-use exchange code or an error.
   * Tokens are never put in the URL.
   */
  async completeSignIn(
    config: OAuthProviderConfig,
    query: { code?: string; state?: string; error?: string },
    expectedState: string | undefined,
  ): Promise<string> {
    try {
      if (query.error) throw new OAuthFlowError(OAUTH_ERROR_CODES.DENIED);
      if (
        !query.state ||
        !expectedState ||
        !safeEqual(query.state, expectedState)
      ) {
        throw new OAuthFlowError(OAUTH_ERROR_CODES.STATE_MISMATCH);
      }
      if (!query.code) {
        throw new OAuthFlowError(OAUTH_ERROR_CODES.PROVIDER_ERROR);
      }

      const profile = await this.providerClient.exchangeCodeForProfile(
        config,
        query.code,
        this.redirectUri(config.provider),
      );
      const userId = await this.resolveUser(profile);
      const code = await this.createExchangeCode(userId);
      await this.audit.record({
        action: AUDIT_ACTIONS.AUTH_OAUTH_SIGN_IN,
        actor: { id: userId },
        targetType: AUDIT_TARGETS.USER,
        targetId: userId,
        metadata: { provider: config.provider },
      });
      this.logger.log(`🔑 ${config.provider} sign-in for user ${userId}`);
      return this.frontendCallbackUrl({ code });
    } catch (error) {
      if (error instanceof OAuthFlowError) {
        return this.frontendCallbackUrl({ error: error.code });
      }
      throw error;
    }
  }

  /**
   * Links to an existing account by verified email, or creates a learner.
   * An existing unverified account is claimed by the verified provider
   * identity: its password is replaced and its sessions revoked, so whoever
   * registered that email without owning it loses access.
   */
  private async resolveUser(profile: OAuthProfile): Promise<string> {
    if (!profile.emailVerified) {
      throw new OAuthFlowError(OAUTH_ERROR_CODES.EMAIL_UNVERIFIED);
    }
    const email = profile.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.isSuspended) {
        throw new OAuthFlowError(OAUTH_ERROR_CODES.ACCOUNT_SUSPENDED);
      }
      if (!existing.isEmailVerified) {
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: existing.id },
            data: {
              isEmailVerified: true,
              password: await unusablePasswordHash(),
              avatarUrl: existing.avatarUrl ?? profile.picture,
            },
          }),
          this.prisma.refreshToken.deleteMany({
            where: { userId: existing.id },
          }),
          this.prisma.verification.deleteMany({
            where: {
              userId: existing.id,
              type: VerificationType.EMAIL_VERIFICATION,
            },
          }),
        ]);
      } else if (!existing.avatarUrl && profile.picture) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { avatarUrl: profile.picture },
        });
      }
      return existing.id;
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name: profile.name.trim() || email.split('@')[0],
        password: await unusablePasswordHash(),
        referralCode: generateReferralCode(8, 'JOS'),
        role: UserRole.USER,
        isEmailVerified: true,
        avatarUrl: profile.picture,
      },
    });
    return user.id;
  }

  private async createExchangeCode(userId: string): Promise<string> {
    const code = randomBytes(EXCHANGE_CODE_BYTES).toString('hex');
    await this.prisma.$transaction([
      this.prisma.verification.deleteMany({
        where: {
          userId,
          type: VerificationType.OAUTH_EXCHANGE,
          expiresAt: { lt: new Date() },
        },
      }),
      this.prisma.verification.create({
        data: {
          userId,
          type: VerificationType.OAUTH_EXCHANGE,
          token: sha256(code),
          expiresAt: new Date(Date.now() + EXCHANGE_CODE_TTL_MS),
        },
      }),
    ]);
    return code;
  }

  /** Trades a single-use exchange code for a normal sign-in session. */
  async exchange(code: string) {
    const record = await this.prisma.verification.findUnique({
      where: { token: sha256(code) },
    });
    const invalid = new UnauthorizedException(
      'This sign-in link is invalid or has expired. Please try again.',
    );
    if (!record || record.type !== VerificationType.OAUTH_EXCHANGE) {
      throw invalid;
    }

    // Deleting by id and checking the count makes the code single-use even
    // when two exchange requests race.
    const { count } = await this.prisma.verification.deleteMany({
      where: { id: record.id },
    });
    if (count !== 1 || record.expiresAt < new Date()) throw invalid;

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user || user.isSuspended) throw invalid;

    return this.authService.createSession(user);
  }
}
