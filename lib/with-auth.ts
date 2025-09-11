// lib/with-auth.ts
import { NextRequest } from 'next/server';
import { json, requireUser, maybeUser, UnauthorizedError, type AuthUser, type Role } from '@/lib/auth-server';

type RouteContext = { params?: Record<string, string | string[]> };

type AuthedHandler =
  (req: NextRequest, ctx: RouteContext, me: AuthUser) =>
    Promise<Response> | Response;

type OptionalAuthedHandler =
  (req: NextRequest, ctx: RouteContext, me: AuthUser | null) =>
    Promise<Response> | Response;

/** Erfordert Login. Mappt UnauthorizedError -> 401 JSON. */
export function withAuth(handler: AuthedHandler) {
  return async (req: NextRequest, ctx: RouteContext) => {
    try {
      const me = await requireUser(req);  // nie null
      return await handler(req, ctx, me);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }
      throw e; // -> Next.js 500
    }
  };
}

/** Login optional, reicht me (oder null) weiter. Kein Auto-401. */
export function withOptionalUser(handler: OptionalAuthedHandler) {
  return async (req: NextRequest, ctx: RouteContext) => {
    const me = await maybeUser(req); // AuthUser | null
    return handler(req, ctx, me);
  };
}

/** Erfordert Login + bestimmte Rolle(n). Mappt fehlende Rolle -> 403. */
export function withRole(roles: Role[] | Role, handler: AuthedHandler) {
  const allow = Array.isArray(roles) ? roles : [roles];
  return withAuth(async (req, ctx, me) => {
    if (!allow.includes(me.role)) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
    return handler(req, ctx, me);
  });
}

/** Bequemlichkeits-Aliase */
export const withAdmin = (handler: AuthedHandler) => withRole('admin', handler);
export const withModerator = (handler: AuthedHandler) => withRole(['admin', 'moderator'], handler);
