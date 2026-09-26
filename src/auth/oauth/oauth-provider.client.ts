import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  OAUTH_ERROR_CODES,
  OAuthFlowError,
  OAuthProfile,
  OAuthProviderConfig,
} from './oauth.types';

const PROVIDER_TIMEOUT_MS = 10_000;

type TokenResponse = { access_token?: string };

type UserInfoResponse = {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

/**
 * The only code that talks to Google/LinkedIn. Kept behind one method so the
 * rest of the OAuth flow can be tested without network calls.
 */
@Injectable()
export class OAuthProviderClient {
  private readonly logger = new Logger(OAuthProviderClient.name);

  async exchangeCodeForProfile(
    config: OAuthProviderConfig,
    code: string,
    redirectUri: string,
  ): Promise<OAuthProfile> {
    try {
      const { data: token } = await axios.post<TokenResponse>(
        config.tokenUrl,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: PROVIDER_TIMEOUT_MS,
        },
      );
      if (!token.access_token) {
        throw new Error('Provider returned no access token');
      }

      const { data: info } = await axios.get<UserInfoResponse>(
        config.userInfoUrl,
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          timeout: PROVIDER_TIMEOUT_MS,
        },
      );
      if (!info.email) {
        throw new Error('Provider returned no email address');
      }

      return {
        email: info.email,
        emailVerified:
          info.email_verified === true || info.email_verified === 'true',
        name: info.name ?? '',
        picture: info.picture,
      };
    } catch (error) {
      const reason = axios.isAxiosError(error)
        ? `${error.response?.status ?? 'network'} from ${error.config?.url}`
        : (error as Error).message;
      this.logger.error(`${config.provider} OAuth exchange failed: ${reason}`);
      throw new OAuthFlowError(OAUTH_ERROR_CODES.PROVIDER_ERROR);
    }
  }
}
