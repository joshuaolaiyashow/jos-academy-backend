import { createHmac } from 'crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const STREAM_TOKEN_TTL_SECONDS = 60;
const STREAM_TOKEN_AUDIENCE = 'notification-stream';

type StreamTokenPayload = { sub: string };

/**
 * EventSource can't send an Authorization header, so the client trades its access token
 * for a short-lived stream token and passes that in the URL. The token is signed with a
 * secret derived from JWT_SECRET: JwtStrategy accepts any JWT_SECRET-signed token with a
 * `sub`, so sharing the secret would let a stream token be replayed as an access token.
 */
@Injectable()
export class NotificationStreamTokenService {
  private readonly secret = createHmac('sha256', process.env.JWT_SECRET ?? '')
    .update(STREAM_TOKEN_AUDIENCE)
    .digest('hex');

  constructor(private readonly jwtService: JwtService) {}

  async issue(userId: string): Promise<{ token: string; expiresIn: number }> {
    const token = await this.jwtService.signAsync(
      { sub: userId } satisfies StreamTokenPayload,
      {
        secret: this.secret,
        audience: STREAM_TOKEN_AUDIENCE,
        expiresIn: STREAM_TOKEN_TTL_SECONDS,
      },
    );
    return { token, expiresIn: STREAM_TOKEN_TTL_SECONDS };
  }

  async verify(token: string): Promise<string> {
    try {
      const payload = await this.jwtService.verifyAsync<StreamTokenPayload>(
        token,
        { secret: this.secret, audience: STREAM_TOKEN_AUDIENCE },
      );
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired stream token');
    }
  }
}
