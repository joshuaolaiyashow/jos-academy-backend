import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/client';

/** The user JwtStrategy.validate attaches to req.user. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isEmailVerified: boolean;
  isSuspended: boolean;
  mustChangePassword: boolean;
  referralCode: string | null;
  createdAt: Date;
};

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
