// lib/with-auth.ts
import { NextRequest } from 'next/server';
import { json, requireUser, maybeUser, UnauthorizedError, type AuthUser, type Role } from '@/lib/auth-server';

export type RouteParams = Record<string, string | string[]>;
export type RouteContext = { params?: RouteParams } | { params?: Promise<RouteParams> };

// 👉 robustes Auslesen, egal ob params ein Promise oder ein Objekt ist
export async function getParams(ctx: RouteContext): Promise<RouteParams> {
  const p: any = (ctx as any)?.params;
  return p && typeof p.then === 'function' ? await p : (p ?? {});
}

type AuthedHandler =
  (req: NextRequest, ctx: RouteContext, me: AuthUser) => Promise<Response> | Response;

type OptionalAuthedHandler =
  (req: NextRequest, ctx: RouteContext, me: AuthUser | null) => Promise<Response> | Response;

export function withAuth(handler: AuthedHandler) {
  return async (req: NextRequest, ctx: RouteContext) => {
    try {
      const me = await requireUser(req);
      return await handler(req, ctx, me);
    } catch (e) {
      if (e instanceof UnauthorizedError) return json({ ok: false, error: 'unauthorized' }, 401);
      throw e;
    }
  };
}

export function withOptionalUser(handler: OptionalAuthedHandler) {
  return async (req: NextRequest, ctx: RouteContext) => {
    const me = await maybeUser(req);
    return handler(req, ctx, me);
  };
}

export function withRole(roles: Role[] | Role, handler: AuthedHandler) {
  const allow = Array.isArray(roles) ? roles : [roles];
  return withAuth(async (req, ctx, me) => {
    if (!allow.includes(me.role)) return json({ ok: false, error: 'forbidden' }, 403);
    return handler(req, ctx, me);
  });
}

export const withAdmin = (h: AuthedHandler) => withRole('admin', h);
export const withModerator = (h: AuthedHandler) => withRole(['admin', 'moderator'], h);
