import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import { verifyWorkspaceToken } from '../auth/keycloak-token';
import { UserRole } from '../generated/prisma/client';
import { AudienceExportGuard } from './workspace-auth.guard';
import { AUDIENCE_KEYS, audienceWhere } from './workspace-audiences';

jest.mock('../auth/keycloak-token', () => ({
  verifyWorkspaceToken: jest.fn(),
}));

const verify = jest.mocked(verifyWorkspaceToken);
const baseQuery = { limit: 100, includeOptedOut: false };

const contextWith = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  }) as unknown as ExecutionContext;

describe('AudienceExportGuard', () => {
  const guard = new AudienceExportGuard();

  it('rejects a missing or unverifiable token with 401', async () => {
    await expect(guard.canActivate(contextWith())).rejects.toThrow(
      UnauthorizedException,
    );
    verify.mockResolvedValueOnce(null);
    await expect(guard.canActivate(contextWith('Bearer x'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a workspace token without audiences:export, even with manage grants', async () => {
    verify.mockResolvedValueOnce({ id: 'sub', roles: ['students:manage'] });
    await expect(guard.canActivate(contextWith('Bearer x'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('accepts audiences:export', async () => {
    verify.mockResolvedValueOnce({ id: 'sub', roles: ['audiences:export'] });
    await expect(guard.canActivate(contextWith('Bearer x'))).resolves.toBe(
      true,
    );
  });
});

describe('audienceWhere', () => {
  it('lists enrolled, unsuspended, opted-in learners by default', () => {
    expect(audienceWhere(AUDIENCE_KEYS.STUDENTS, baseQuery)).toEqual({
      isSuspended: false,
      email: { not: '' },
      marketingOptOut: false,
      role: UserRole.USER,
      enrollments: { some: { status: { in: ['ACTIVE', 'COMPLETED'] } } },
    });
  });

  it('narrows students to one program and adds a case-insensitive search', () => {
    const where = audienceWhere(AUDIENCE_KEYS.STUDENTS, {
      ...baseQuery,
      program: 'course-1',
      search: 'ada',
    });
    expect(where.enrollments).toEqual({
      some: { status: { in: ['ACTIVE', 'COMPLETED'] }, courseId: 'course-1' },
    });
    expect(where.OR).toEqual([
      { email: { contains: 'ada', mode: 'insensitive' } },
      { name: { contains: 'ada', mode: 'insensitive' } },
    ]);
  });

  it('lists instructors only, and drops the opt-out filter for service announcements', () => {
    const where = audienceWhere(AUDIENCE_KEYS.INSTRUCTORS, {
      ...baseQuery,
      includeOptedOut: true,
    });
    expect(where.role).toBe(UserRole.INSTRUCTOR);
    expect(where).not.toHaveProperty('marketingOptOut');
    expect(where).not.toHaveProperty('enrollments');
  });
});
