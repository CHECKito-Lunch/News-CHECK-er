'use client';

import { useEffect, useState } from 'react';

type State = 'none'|'confirmed'|'waitlist';
export default function EventRsvpInner(props: { eventId:number; capacity:number|null; confirmed:number; waitlist:number }) {
  const { eventId } = props;
  const [state, setState] = useState<State>('none');
  const [confirmed, setConfirmed] = useState(props.confirmed);
  const [waitlist, setWaitlist] = useState(props.waitlist);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');

  // initialen Status laden
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/events/${eventId}/rsvp`, { cache: 'no-store', credentials: 'include' });
        const j = await r.json().catch(() => null);
        if (j?.ok && j.state) setState(j.state as State);
      } catch {}
    })();
  }, [eventId]);

  async function doAction(action: 'join'|'leave') {
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      setState(j.state as State);
      setConfirmed(j.confirmed_count);
      setWaitlist(j.waitlist_count);
      if (j.notice) setMsg(j.notice);
    } catch (e:any) {
      setMsg(e?.message ?? 'Fehler.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Status: <strong>
            {state === 'none' ? 'nicht angemeldet' : state === 'confirmed' ? 'bestätigt' : 'Warteliste'}
          </strong>
          {' · '}
          Plätze: <strong>{confirmed}</strong>
          {props.capacity ? <> / <strong>{props.capacity}</strong></> : <> / ∞</>}
          {waitlist > 0 && <> · Warteliste: <strong>{waitlist}</strong></>}
        </div>

        <div className="flex gap-2">
          {state === 'none' && (
            <button
              disabled={busy}
              onClick={() => doAction('join')}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Jetzt anmelden
            </button>
          )}
          {state !== 'none' && (
            <button
              disabled={busy}
              onClick={() => doAction('leave')}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
            >
              Abmelden
            </button>
          )}
        </div>
      </div>

      {msg && <div className="text-sm text-gray-600 dark:text-gray-300">{msg}</div>}
    </div>
  );
}
