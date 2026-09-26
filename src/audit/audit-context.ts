import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

import type { UserRole } from '../generated/prisma/client';

type AuditRequest = Request & { user?: { id?: string; role?: UserRole } };

/**
 * Holds the current request for the lifetime of its async chain, so AuditService can
 * read the signed-in actor (set later by JwtAuthGuard on the same object), the IP
 * and the user agent without every service method taking them as parameters.
 */
export const auditRequestStorage = new AsyncLocalStorage<AuditRequest>();

export const auditContextMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  auditRequestStorage.run(req, next);
};
