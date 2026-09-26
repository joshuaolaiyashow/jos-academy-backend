import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { ReferralModule } from '../referral/referral.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { OAuthProviderClient } from './oauth/oauth-provider.client';

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    ReferralModule,
    // Access/refresh token secrets and expirations are set explicitly per
    // `signAsync`/`verifyAsync` call in AuthService, since they differ
    // (15m access vs 30d refresh, two different secrets). This registration
    // only provides the default secret JwtStrategy verifies access tokens
    // against.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, OAuthService, OAuthProviderClient],
  // OAuthController first so /auth/oauth/* is never shadowed by AuthController.
  controllers: [OAuthController, AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
