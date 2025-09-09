'use client';

import { useEffect, useState } from 'react';

type State = 'none' | 'confirmed' | 'waitlist';

type RsvpPayload =
  | {
      ok: true;
      state: State;
      confirmed_count: number;
      waitlist_count: number;
      notice?: string;
    }
  | { ok: false; error?: string };

async function readJsonSafe(r: Response) {
  const raw = await r.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Supabase-Access-Token aus dem Cookie `sb-*-auth-token` lesen (base64-kodiertes JSON). */
function readSupabaseAccessTokenFromCookie(): string | null {
  // Cookie-Name ist dynamisch (sb-<ref>-auth-token)
  const m = document.cookie.match(/(?:^|;\s*)(sb-[^=]+-auth-token)=([^;]+)/);
  if (!m) return null;
  try {
    const raw = decodeURIComponent(m[2]);
    // Supabase speichert oft mit Präfix "base64-<payload>"
    const b64 = raw.startsWith('base64-') ? raw.slice(7) : raw;
    const json = atob(b64);
    const obj = JSON.parse(json);
    // verschiedene Supabase-Versionen:
    return obj?.access_token || obj?.currentSession?.access_token || null;
  } catch {
    return null;
  }
}

/** Stellt sicher, dass auf DIESEM Origin eine Session via /api/login gesetzt ist. */
async function ensureOriginSession(): Promise<boolean> {
  const token = readSupabaseAccessTokenFromCookie();
  if (!token) return false;
  const r = await fetch('/api/login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  return r.ok;
}

export default function EventRsvpInner(props: {
  eventId: number;
  capacity: number | null;
  confirmed: number;
  waitlist: number;
}) {
  const { eventId, capacity } = props;

  const [state, setState] = useState<State>('none');
  const [confirmed, setConfirmed] = useState(props.confirmed);
  const [waitlist, setWaitlist] = useState(props.waitlist);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [authErr, setAuthErr] = useState<string>(''); // gefüllt bei 401

  // bei Event-Wechsel Grundwerte aus Props übernehmen
  useEffect(() => {
    setConfirmed(props.confirmed);
    setWaitlist(props.waitlist);
    setState('none');
    setMsg('');
    setAuthErr('');
  }, [eventId, props.confirmed, props.waitlist]);

  // initialen Status laden (mit Auto-Login- und Retry-Logik)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let r = await fetch(`/api/events/${eventId}/rsvp`, {
          cache: 'no-store',
          credentials: 'include',
        });

        if (r.status === 401) {
          // Versuch: Session auf diesem Host setzen und nochmal probieren
          if (await ensureOriginSession()) {
            r = await fetch(`/api/events/${eventId}/rsvp`, {
              cache: 'no-store',
              credentials: 'include',
            });
          }
        }

        if (r.status === 401) {
          if (!cancelled) setAuthErr('Bitte einloggen, um dich anzumelden.');
          return;
        }

        const j = (await readJsonSafe(r)) as RsvpPayload | null;
        if (!cancelled && j && 'ok' in j && j.ok && j.state) {
          setState(j.state);
        }
      } catch {
        /* ignore – Widget bleibt benutzbar */
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  async function doAction(action: 'join' | 'leave') {
    setBusy(true);
    setMsg('');
    setAuthErr('');
    try {
      let r = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (r.status === 401) {
        if (await ensureOriginSession()) {
          r = await fetch(`/api/events/${eventId}/rsvp`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
        }
      }

      if (r.status === 401) {
        setAuthErr('Bitte einloggen, um dich anzumelden.');
        return;
      }

      const j = (await readJsonSafe(r)) as RsvpPayload | null;
      if (!r.ok || !j || !('ok' in j) || !j.ok) {
        const err = (j && 'error' in j && j.error) || `HTTP ${r.status}`;
        throw new Error(err);
      }

      setState(j.state);
      setConfirmed(j.confirmed_count);
      setWaitlist(j.waitlist_count);
      if (j.notice) setMsg(j.notice);
    } catch (e: any) {
      setMsg(e?.message ?? 'Fehler.');
    } finally {
      setBusy(false);
    }
  }

  const full = typeof capacity === 'number' && confirmed >= capacity;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Status:{' '}
          <strong>
            {state === 'none'
              ? 'nicht angemeldet'
              : state === 'confirmed'
              ? 'bestätigt'
              : 'Warteliste'}
          </strong>
          {' · '}Plätze:{' '}
          <strong>{confirmed}</strong>
          {capacity != null ? (
            <>
              {' '}
              / <strong>{capacity}</strong>
            </>
          ) : (
            <> / ∞</>
          )}
          {waitlist > 0 && (
            <>
              {' · '}Warteliste: <strong>{waitlist}</strong>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {!authErr && state === 'none' && (
            <button
              disabled={busy}
              onClick={() => doAction('join')}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm"
              title={full ? 'Event ist voll – du landest auf der Warteliste' : undefined}
            >
              {busy ? '…' : full ? 'Auf Warteliste' : 'Jetzt anmelden'}
            </button>
          )}

          {!authErr && state !== 'none' && (
            <button
              disabled={busy}
              onClick={() => doAction('leave')}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? '…' : 'Abmelden'}
            </button>
          )}
        </div>
      </div>

      {authErr && (
        <div className="text-sm text-amber-600 dark:text-amber-400">
          {authErr}{' '}
          <a href="/auth/login" className="underline">
            Login
          </a>
        </div>
      )}

      {msg && <div className="text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
    </div>
  );
}
