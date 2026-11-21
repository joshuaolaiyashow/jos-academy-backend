import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { hasModuleGrant, verifyWorkspaceToken } from '../auth/keycloak-token';
import { UserRole } from '../generated/prisma/client';
import {
  AUDIENCE_EXPORT_ROLE,
  WORKSPACE_ADMIN_PATH,
} from './workspace.constants';

const BEARER_PREFIX = 'Bearer ';
const WORKSPACE_ADMIN_PREFIX = `/${WORKSPACE_ADMIN_PATH}/`;

type GuardedRequest = Request & { user?: { id: string; role: UserRole } };

const bearerToken = (req: Request): string => {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedException('Authentication required');
  }
  return header.slice(BEARER_PREFIX.length);
};

// `/workspace/admin/programs/<id>/start-review` -> `programs`, the manifest module key the Keycloak roles are named after.
const moduleOf = (path: string): string =>
  path.startsWith(WORKSPACE_ADMIN_PREFIX)
    ? (path.slice(WORKSPACE_ADMIN_PREFIX.length).split('/')[0] ?? '')
    : '';

/**
 * The workspace routes take a JOS Workspace (Keycloak) token carrying the module's grant
 * (`programs:view` for reads, `programs:manage` for changes), or a local ADMIN JWT.
 */
@Injectable()
export class WorkspaceAuthGuard implements CanActivate {
  private readonly localJwt = new JwtAuthGuard();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GuardedRequest>();
    const identity = await verifyWorkspaceToken(bearerToken(req));
    if (identity) {
      if (
        !hasModuleGrant(
          identity.roles,
          moduleOf(req.path),
          req.method !== 'GET',
        )
      ) {
        throw new ForbiddenException('You do not have permission to do this');
      }
      // The module grant above is the real limit; ADMIN lets the shared admin services run, and the id is the Keycloak sub for audit.
      req.user = { id: identity.id, role: UserRole.ADMIN };
      return true;
    }
    // shortcut: the local ADMIN JWT keeps working until Academy's cutover; delete this fallback then.
    await this.localJwt.canActivate(context);
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Access denied. Only authorized roles can perform this action.',
      );
    }
    return true;
  }
}

/** The manifest is structure only, but it maps the back office, so only a JOS Workspace token may read it. */
@Injectable()
export class WorkspaceTokenGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!(await verifyWorkspaceToken(bearerToken(req)))) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }
}

/** Broadcast audiences: a JOS Workspace token holding `audiences:export`, and nothing else. */
@Injectable()
export class AudienceExportGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const identity = await verifyWorkspaceToken(bearerToken(req));
    if (!identity) throw new UnauthorizedException('Invalid or expired token');
    if (!identity.roles.includes(AUDIENCE_EXPORT_ROLE)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
