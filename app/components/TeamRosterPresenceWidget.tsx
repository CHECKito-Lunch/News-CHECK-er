/* eslint-disable react-hooks/exhaustive-deps */
'use client';
import { useEffect, useMemo, useState } from 'react';

// ————————————————————————————————————————————————
// Types & helpers (kompatibel zu deinem bestehenden Code)
// ————————————————————————————————————————————————

type Item = {
  id: string;
  user_id: string;
  user_name?: string | null;
  day: string; // YYYY-MM-DD
  start_min: number | null;
  end_min: number | null;
  minutes_worked: number | null;
  label: string | null;
  kind: 'work' | 'absent' | 'holiday' | 'free';
  note: string | null;
};

const ymdInTz = (d: Date, tz = 'Europe/Berlin') =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const fmtDay = (iso: string) => {
  const safe = new Date(iso + 'T12:00:00Z');
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(safe);
};

const isPresent = (it: Item) => {
  const s = it.start_min,
    e = it.end_min;
  return (
    Number.isFinite(s) &&
    Number.isFinite(e) &&
    (s as number) >= 0 &&
    (e as number) > (s as number)
  );
};

// Badges
const badgeCls = (present: boolean) =>
  present
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';

const Stat = ({ label, value, subtle = false }: { label: string; value: number; subtle?: boolean }) => (
  <div className={`flex flex-col ${subtle ? 'text-gray-500 dark:text-gray-400' : ''}`}>
    <span className="text-[11px] uppercase tracking-wide">{label}</span>
    <span className="text-lg font-semibold leading-tight">{value}</span>
  </div>
);

// ————————————————————————————————————————————————
// Widget: Zeigt Anwesend/Abwesend Summen (Heute + je Tag)
// ————————————————————————————————————————————————

export default function TeamRosterPresenceWidget({
  teamId, // optional – weglassen, um ALLE Personen über alle Teams zu holen (sofern API das erlaubt)
  days = 7,
  mode = 'people', // 'people' | 'summary' – default: Personenliste
}: {
  teamId?: number;
  days?: number;
  mode?: 'people' | 'summary';
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Zeitraum (Berlin TZ)
  const now = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => ymdInTz(now, 'Europe/Berlin'), [now]);
  const from = todayISO;
  const to = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + Math.max(0, days));
    return ymdInTz(d, 'Europe/Berlin');
  }, [now, days]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from, to });
        if (typeof teamId === 'number') qs.set('team_id', String(teamId)); // nur filtern, wenn gesetzt
        const r = await fetch(`/api/teamhub/roster?${qs.toString()}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch (e) {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [teamId, from, to]);

  // ———————————————————————————————————
  // Aggregation A) nach Tag (für "summary")
  // ———————————————————————————————————
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const arr = map.get(it.day) ?? [];
      arr.push(it);
      map.set(it.day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [items]);

  const perDay = useMemo(() => {
    return byDay.map(([day, arr]) => {
      let present = 0;
      let absent = 0;
      for (const it of arr) (isPresent(it) ? present++ : absent++);
      return { day, present, absent, total: present + absent };
    });
  }, [byDay]);

  const totals = useMemo(() => {
    let present = 0;
    let absent = 0;
    for (const d of perDay) {
      present += d.present;
      absent += d.absent;
    }
    return { present, absent, total: present + absent };
  }, [perDay]);

  // ———————————————————————————————————
  // Aggregation B) Personen-Ansicht (teamunabhängig)
  // ———————————————————————————————————
  type PersonAgg = {
    user_id: string;
    name: string;
    presentDays: number;
    absentDays: number;
    presentToday: boolean | null; // null = heute kein Eintrag
  };

  const byPerson: PersonAgg[] = useMemo(() => {
    const map = new Map<string, PersonAgg>();

    // Hilfsstruktur: todays map pro user
    const todays = new Map<string, Item[]>();

    for (const it of items) {
      const key = it.user_id || it.user_name || it.id; // Fallback, falls user_id fehlt
      const name = (it.user_name || '—').trim();
      if (!map.has(key)) map.set(key, { user_id: key, name, presentDays: 0, absentDays: 0, presentToday: null });
      const agg = map.get(key)!;
      // Zähle Tagesstatus
      if (isPresent(it)) agg.presentDays += 1; else agg.absentDays += 1;
      // Sammle heutige Einträge
      if (it.day === todayISO) {
        const arr = todays.get(key) ?? [];
        arr.push(it);
        todays.set(key, arr);
      }
    }

    // Präsenz heute ableiten: wenn mind. ein Eintrag heute vorhanden ist
    for (const [key, todaysItems] of todays) {
      const presentAny = todaysItems.some(isPresent);
      map.get(key)!.presentToday = presentAny;
    }

    // Sortierung: heute anwesend zuerst, dann Name
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const at = a.presentToday === true ? 0 : a.presentToday === false ? 1 : 2;
      const bt = b.presentToday === true ? 0 : b.presentToday === false ? 1 : 2;
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name, 'de');
    });
    return list;
  }, [items, todayISO]);

  const uniquePeople = byPerson.length;
  const presentTodayCount = byPerson.filter(p => p.presentToday === true).length;

  // ———————————————————————————————————
  // Render
  // ———————————————————————————————————
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
        <div className="font-semibold text-sm">{mode === 'people' ? 'Personen im Plan' : `Anwesenheits-Widget (heute + nächste ${days} Tage)`}</div>
        <div className="ml-auto flex items-center gap-4">
          {mode === 'people' ? (
            <>
              <div className="flex flex-col text-gray-500 dark:text-gray-400">
                <span className="text-[11px] uppercase tracking-wide">Personen</span>
                <span className="text-lg font-semibold leading-tight">{uniquePeople}</span>
              </div>
              <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${badgeCls(true)}`}>
                Heute anwesend {presentTodayCount}
              </span>
            </>
          ) : (
            <>
              <div className="flex flex-col text-gray-500 dark:text-gray-400">
                <span className="text-[11px] uppercase tracking-wide">Gesamt</span>
                <span className="text-lg font-semibold leading-tight">{totals.total}</span>
              </div>
              <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${badgeCls(true)}`}>Anwesend {totals.present}</span>
              <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${badgeCls(false)}`}>Abwesend {totals.absent}</span>
            </>
          )}
        </div>
      </div>

      {mode === 'people' ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {loading && <div className="p-4 text-sm text-gray-500">Lade…</div>}
          {!loading && uniquePeople === 0 && (
            <div className="p-4 text-sm text-gray-500">Keine Personen im Zeitraum.</div>
          )}
          {!loading && byPerson.map(p => (
            <div key={p.user_id} className="px-3 py-2 flex items-center gap-3 justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[12px] text-gray-500">Tage: Anwesend {p.presentDays} · Abwesend {p.absentDays}</div>
              </div>
              <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${p.presentToday === true ? badgeCls(true) : p.presentToday === false ? badgeCls(false) : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300'}`}>
                {p.presentToday === true ? 'Heute anwesend' : p.presentToday === false ? 'Heute abwesend' : 'Heute kein Eintrag'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        // Alte Summary-Ansicht behalten
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {loading && <div className="p-4 text-sm text-gray-500">Lade…</div>}
          {!loading && perDay.length === 0 && (
            <div className="p-4 text-sm text-gray-500">Keine Einträge im Zeitraum.</div>
          )}
          {!loading &&
            perDay.map(({ day, present, absent, total }) => (
              <div key={day} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-3 items-center gap-3">
                <div className="text-sm font-medium truncate">
                  {day === todayISO ? `Heute · ${fmtDay(day)}` : fmtDay(day)}
                </div>
                <div className="sm:justify-self-center flex items-center gap-2">
                  <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${badgeCls(true)}`}>Anwesend {present}</span>
                  <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${badgeCls(false)}`}>Abwesend {absent}</span>
                </div>
                <div className="sm:justify-self-end">
                  <div className="flex flex-col text-gray-500 dark:text-gray-400">
                    <span className="text-[11px] uppercase tracking-wide">Einträge</span>
                    <span className="text-lg font-semibold leading-tight">{total}</span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————
// Hinweise zur Nutzung
// ————————————————————————————————————————————————
// Personenliste (teamunabhängig):
// <TeamRosterPresenceWidget mode="people" days={7} />
// Optional auf Team einschränken:
// <TeamRosterPresenceWidget teamId={123} mode="people" days={7} />
// Zusammenfassungs-Ansicht wie zuvor:
// <TeamRosterPresenceWidget teamId={123} mode="summary" days={7} />
// API: /api/teamhub/roster?from=YYYY-MM-DD&to=YYYY-MM-DD[&team_id=123]

// ————————————————————————————————————————————————
// Neue, minimalistische Variante: ZWEI KACHELN (Anwesend/Abwesend)
// ————————————————————————————————————————————————

export function PresenceTiles({
  teamId,
  dayISO,
  days = 0, // 0 = nur heute, >0 = inkl. Folge-Tage aggregiert
  tz = 'Europe/Berlin',
  showNames = true, // Namen unter der Zahl anzeigen (gekürzt)
  maxNames = 10,    // max. Namen pro Kachel
}: {
  teamId?: number;
  dayISO?: string; // Standard = heute in TZ
  days?: number;
  tz?: string;
  showNames?: boolean;
  maxNames?: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const todayISO = useMemo(() => dayISO ?? ymdInTz(new Date(), tz), [dayISO, tz]);
  const from = todayISO;
  const to = useMemo(() => {
    if (!days || days <= 0) return todayISO;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return ymdInTz(d, tz);
  }, [todayISO, days, tz]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from, to });
        if (typeof teamId === 'number') qs.set('team_id', String(teamId));
        const r = await fetch(`/api/teamhub/roster?${qs.toString()}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [teamId, from, to]);

  // Dedupliziere nach Person (user_id bevorzugt, sonst Name)
  type P = { key: string; name: string; present: boolean };
  const people: P[] = useMemo(() => {
    const map = new Map<string, { name: string; present: boolean }>();
    for (const it of items) {
      if (it.day < from || it.day > to) continue;
      const key = it.user_id || it.user_name || String(it.id);
      const name = (it.user_name || '—').trim();
      const pres = isPresent(it);
      const prev = map.get(key);
      if (!prev) map.set(key, { name, present: pres });
      else if (!prev.present && pres) map.set(key, { name, present: true }); // once present → present
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, name: v.name, present: v.present }));
  }, [items, from, to]);

  const present = people.filter(p => p.present);
  const absent = people.filter(p => !p.present);

  const Tile = ({ title, count, names, variant }: { title: string; count: number; names: string[]; variant: 'present' | 'absent' }) => (
    <div className={`rounded-2xl border p-5 ${
      variant === 'present'
        ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-900/20'
        : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/20'
    }`}>
      <div className="flex items-baseline gap-3">
        <div className="text-4xl font-extrabold tracking-tight">{loading ? '–' : count}</div>
        <div className="text-sm font-semibold opacity-80">{title}</div>
      </div>
      {showNames && (
        <div className="mt-2 text-sm text-gray-800 dark:text-gray-200">
          {loading ? (
            <div className="animate-pulse h-5 w-2/3 rounded bg-black/10 dark:bg-white/10" />
          ) : names.length ? (
            <div className="flex flex-wrap gap-1.5">
              {names.slice(0, maxNames).map((n, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">
                  {n}
                </span>
              ))}
              {names.length > maxNames && (
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">+{names.length - maxNames} weitere</span>
              )}
            </div>
          ) : (
            <span className="text-[12px] opacity-70">—</span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Tile title="Anwesend" count={present.length} names={present.map(p => p.name)} variant="present" />
      <Tile title="Abwesend" count={absent.length} names={absent.map(p => p.name)} variant="absent" />
    </div>
  );
}

// ————————————————————————————————————————————————
// Neue Variante: SCHICHT-KACHELN (Früh/Mittel/Spät/Abwesend)
// ————————————————————————————————————————————————

export function PresenceShiftTiles({
  dayISO,
  tz = 'Europe/Berlin',
  days = 0,              // 0 = nur heute
  showNames = true,
  maxNames = 10,
  // Schichtgrenzen per Startzeit (in Minuten ab 00:00)
  earlyStart = 5 * 60,   // 05:00 inkl.
  middleStart = 11 * 60, // 11:00 inkl.
  lateStart = 17 * 60,   // 17:00 inkl.
  teamId,                // optionaler Filter; weglassen => alle Teams
}: {
  dayISO?: string;
  tz?: string;
  days?: number;
  showNames?: boolean;
  maxNames?: number;
  earlyStart?: number;
  middleStart?: number;
  lateStart?: number;
  teamId?: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const todayISO = useMemo(() => dayISO ?? ymdInTz(new Date(), tz), [dayISO, tz]);
  const from = todayISO;
  const to = useMemo(() => {
    if (!days || days <= 0) return todayISO;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return ymdInTz(d, tz);
  }, [todayISO, days, tz]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ from, to });
        if (typeof teamId === 'number') qs.set('team_id', String(teamId));
        const r = await fetch(`/api/teamhub/roster?${qs.toString()}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [teamId, from, to]);

  // Klassifikation nach Startzeit; fällt in den Bereich [earlyStart, middleStart) => Früh etc.
  function classifyShift(startMin: number | null | undefined): 'frueh' | 'mittel' | 'spaet' | null {
    if (!Number.isFinite(startMin) || (startMin as number) < 0) return null;
    const s = startMin as number;
    if (s >= earlyStart && s < middleStart) return 'frueh';
    if (s >= middleStart && s < lateStart) return 'mittel';
    if (s >= lateStart) return 'spaet';
    // Vor earlyStart (z.B. <05:00) zählen wir zur Frühschicht
    if (s >= 0 && s < earlyStart) return 'frueh';
    return null;
  }

  type P = { key: string; name: string; shift: 'frueh'|'mittel'|'spaet'|null; present: boolean };
  const peopleToday: P[] = useMemo(() => {
    // Nur der Referenztag (from) für die Kacheln
    const dayItems = items.filter(it => it.day === from);
    const map = new Map<string, { name: string; bestStart: number | null; present: boolean }>();

    for (const it of dayItems) {
      const key = it.user_id || it.user_name || it.id;
      const name = (it.user_name || '—').trim();
      const pres = isPresent(it);
      const start = Number.isFinite(it.start_min) ? (it.start_min as number) : null;
      const prev = map.get(key);
      if (!prev) map.set(key, { name, bestStart: start, present: pres });
      else {
        // wenn mehrere Einträge: früheste Startzeit bevorzugen, Präsenz wenn irgendein Eintrag präsent ist
        const bestStart = prev.bestStart == null ? start : start == null ? prev.bestStart : Math.min(prev.bestStart, start);
        map.set(key, { name, bestStart, present: prev.present || pres });
      }
    }

    return Array.from(map.entries()).map(([key, v]) => ({
      key,
      name: v.name,
      shift: v.present ? classifyShift(v.bestStart) : null,
      present: v.present,
    }));
  }, [items, from, earlyStart, middleStart, lateStart]);

  const namesFrueh  = peopleToday.filter(p => p.present && p.shift === 'frueh').map(p => p.name);
  const namesMittel = peopleToday.filter(p => p.present && p.shift === 'mittel').map(p => p.name);
  const namesSpaet  = peopleToday.filter(p => p.present && p.shift === 'spaet').map(p => p.name);
  const namesAbsent = peopleToday.filter(p => !p.present).map(p => p.name);

  const Tile = ({ title, count, names, tone }: { title: string; count: number; names: string[]; tone: 'emerald'|'sky'|'violet'|'amber' }) => {
    const toneMap: Record<string, string> = {
      emerald: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-900/20',
      sky:     'border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-900/20',
      violet:  'border-violet-200 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-900/20',
      amber:   'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/20',
    };
    return (
      <div className={`rounded-2xl border p-5 ${toneMap[tone]}`}>
        <div className="flex items-baseline gap-3">
          <div className="text-4xl font-extrabold tracking-tight">{loading ? '–' : count}</div>
          <div className="text-sm font-semibold opacity-80">{title}</div>
        </div>
        {showNames && (
          <div className="mt-2 text-sm text-gray-800 dark:text-gray-200">
            {loading ? (
              <div className="animate-pulse h-5 w-2/3 rounded bg-black/10 dark:bg-white/10" />
            ) : names.length ? (
              <div className="flex flex-wrap gap-1.5">
                {names.slice(0, maxNames).map((n, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">{n}</span>
                ))}
                {names.length > maxNames && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">+{names.length - maxNames} weitere</span>
                )}
              </div>
            ) : (
              <span className="text-[12px] opacity-70">—</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile title="Frühschicht"   count={namesFrueh.length}  names={namesFrueh}  tone="emerald" />
      <Tile title="Mittelschicht" count={namesMittel.length} names={namesMittel} tone="sky" />
      <Tile title="Spätschicht"   count={namesSpaet.length}  names={namesSpaet}  tone="violet" />
      <Tile title="Abwesend"      count={namesAbsent.length} names={namesAbsent} tone="amber" />
    </div>
  );
}

// Verwendung:
// <PresenceShiftTiles />                       // heute, alle Teams
// <PresenceShiftTiles dayISO="2025-10-22" />   // konkretes Datum
// <PresenceShiftTiles days={0} />               // nur heute (Default)
// <PresenceShiftTiles earlyStart={360} middleStart={660} lateStart={1020} /> // Schichtgrenzen anpassen
// <PresenceShiftTiles showNames={false} />

