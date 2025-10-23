/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/with-auth.ts
import { NextRequest } from "next/server";
import {
  json, requireUser, maybeUser,
  UnauthorizedError, type AuthUser, type Role
} from "@/lib/auth-server";

// ------------------------------
// Interne (loose) Shapes für Helper
// ------------------------------
export type RouteParams = Record<string, string | string[]>;
type MaybePromise<T> = T | Promise<T>;

// --- Type guard ---
function isPromise<T = unknown>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as any).then === "function";
}

// 👉 robustes Auslesen, egal ob params ein Promise oder ein Objekt ist
// WICHTIG: ctx jetzt 'unknown', damit Aufrufe mit unbekanntem Context (z. B. aus HOFs) nicht meckern.
export async function getParams(ctx: unknown): Promise<RouteParams> {
  const p = (ctx as any)?.params;
  return isPromise<RouteParams>(p) ? await p : (p ?? {});
}

// Bequeme Helper (ebenfalls 'unknown' akzeptieren)
export async function getParam(ctx: unknown, key: string): Promise<string | undefined> {
  const p = await getParams(ctx);
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function getParamNumber(ctx: unknown, key: string): Promise<number | null> {
  const raw = await getParam(ctx, key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Optionaler Strict-Helper (wirft fertige Response bei Fehler)
export async function requireParamNumber(
  ctx: unknown, key: string, badRequestMessage = "bad_param"
): Promise<number> {
  const n = await getParamNumber(ctx, key);
  if (n === null || n <= 0) {
    throw json({ ok: false, error: badRequestMessage }, 400);
  }
  return n;
}

// ------------------------------
// Auth-Wrappers (generisch über das echte Route-Context der Datei)
// ------------------------------
type AuthedHandler<C> =
  (req: NextRequest, ctx: C, me: AuthUser) => Response | Promise<Response>;

type OptionalAuthedHandler<C> =
  (req: NextRequest, ctx: C, me: AuthUser | null) => Response | Promise<Response>;

export function withAuth<C>(handler: AuthedHandler<C>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      const me = await requireUser(req);
      return await handler(req, ctx, me);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      throw e;
    }
  };
}

export function withOptionalUser<C>(handler: OptionalAuthedHandler<C>) {
  return async (req: NextRequest, ctx: C) => {
    const me = await maybeUser(req);
    return handler(req, ctx, me);
  };
}

export function withRole<C>(roles: Role[] | Role, handler: AuthedHandler<C>) {
  const allow = Array.isArray(roles) ? roles : [roles];
  return withAuth<C>(async (req, ctx, me) => {
    if (!allow.includes(me.role)) return json({ ok: false, error: "forbidden" }, 403);
    return handler(req, ctx, me);
  });
}

// ------------------------------
// Vordefinierte Role-Wrapper
// ------------------------------

/** Nur Admin */
export const withAdmin = <C,>(h: AuthedHandler<C>) => withRole<C>("admin", h);

/** Admin oder Moderator (ohne Teamleiter) */
export const withModerator = <C,>(h: AuthedHandler<C>) => withRole<C>(["admin", "moderator"], h);

/** Admin, Moderator oder Teamleiter (alle haben Admin-Rechte) */
export const withAdminRights = <C,>(h: AuthedHandler<C>) => 
  withRole<C>(["admin", "moderator", "teamleiter"], h);

/** Alias für withAdminRights (semantisch klarer für manche Fälle) */
export const withAdminOrTeamleiter = withAdminRights;
