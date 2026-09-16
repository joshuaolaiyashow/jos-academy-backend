import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub?: string;
  id?: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super_secret_jwt_key_jos_academy_2026',
    });
  }

  async validate(payload: JwtPayload) {
    const userId = payload.sub || payload.id;

    if (!userId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isEmailVerified: true,
        referralCode: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address to access this resource',
      );
    }

    return user;
  }
}
