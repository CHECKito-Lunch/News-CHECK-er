// app/admin/polls/PollsAdminClient.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/fetchWithSupabase';

type PollRow = {
  id: string;
  question: string;
  options: string[];
  multi_choice: boolean;
  max_choices: number;
  allow_change: boolean;
  closed_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type CountRow = { option_index: number; votes: number };

const inputClass =
  'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const cardClass =
  'card p-4 rounded-2xl shadow-sm bg-white border border-gray-200 ' +
  'dark:bg-gray-900 dark:border-gray-800';

const btnBase =
  'px-3 py-2 rounded-lg text-sm font-medium transition border ' +
  'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
  'dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

const btnPrimary =
  'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

function Switch({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`}>
      {label && <span className="text-sm">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition
          ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}
      >
        <span
          className={`h-5 w-5 transform rounded-full bg-white shadow transition
            ${checked ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </button>
    </label>
  );
}

/* ========= Dialog: Poll erstellen/bearbeiten ========= */
function PollModal({
  open,
  onClose,
  poll,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  poll: PollRow | null; // null = neu
  onSaved: () => void;  // reload
}) {
  const creating = !poll;

  const [id, setId] = useState(poll?.id ?? '');
  const [question, setQuestion] = useState(poll?.question ?? '');
  const [options, setOptions] = useState<string[]>(poll?.options ?? ['Option A', 'Option B']);
  const [multi, setMulti] = useState<boolean>(!!poll?.multi_choice);
  const [maxChoices, setMaxChoices] = useState<number>(poll?.max_choices ?? 1);
  const [allowChange, setAllowChange] = useState<boolean>(poll?.allow_change ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setId(poll?.id ?? '');
    setQuestion(poll?.question ?? '');
    setOptions(poll?.options ?? ['Option A', 'Option B']);
    setMulti(!!poll?.multi_choice);
    setMaxChoices(poll?.max_choices ?? 1);
    setAllowChange(poll?.allow_change ?? true);
    setSaving(false);
  }, [open, poll]);

  function setOptionAt(i: number, val: string) {
    setOptions(prev => prev.map((o, idx) => (idx === i ? val : o)));
  }
  function addOption() {
    setOptions(prev => [...prev, `Option ${prev.length + 1}`]);
  }
  function removeOption(i: number) {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  }
  function moveOption(i: number, dir: -1 | 1) {
    setOptions(prev => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  async function save() {
    if (!question.trim()) {
      alert('Frage ist erforderlich.');
      return;
    }
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      alert('Mindestens zwei Optionen angeben.');
      return;
    }
    if (!multi && maxChoices !== 1) {
      alert('Bei Einzelwahl muss max_choices = 1 sein.');
      return;
    }
    if (multi && (maxChoices < 1 || maxChoices > cleanOptions.length)) {
      alert('max_choices muss zwischen 1 und Anzahl Optionen liegen.');
      return;
    }

    setSaving(true);
    try {
      // Neu anlegen: POST /api/admin/polls
      // Update: PATCH /api/admin/polls/[id]
      const payload: Partial<PollRow> = {
        id: creating ? id || undefined : id || poll!.id, // wenn leer, serverseitig generieren
        question: question.trim(),
        options: cleanOptions,
        multi_choice: multi,
        max_choices: multi ? maxChoices : 1,
        allow_change: allowChange,
      };

      if (creating) {
        const r = await authedFetch('/api/admin/polls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Anlegen fehlgeschlagen.');
      } else {
        const pid = poll!.id;
        const r = await authedFetch(`/api/admin/polls/${encodeURIComponent(pid)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Speichern fehlgeschlagen.');
      }

      onSaved();
      onClose();
    } catch (e: any) {
      alert(e?.message ?? 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-8 mx-auto max-w-3xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {creating ? 'Neue Abstimmung' : `Abstimmung bearbeiten: ${poll?.id}`}
          </div>
          <div className="flex gap-2">
            <button className={btnBase} onClick={onClose}>Schließen</button>
            <button className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Frage</label>
              <input className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} />
            </div>
            <div>
              <label className="form-label">ID (optional – frei wählbar)</label>
              <input
                className={inputClass}
                value={id}
                onChange={(e) => setId(e.target.value.replace(/\s+/g, '-'))}
                placeholder="z.B. team-lunch-sept25"
                disabled={!creating}
              />
              <p className="text-xs text-gray-500 mt-1">Leer lassen ⇒ Server generiert.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Switch checked={multi} onChange={(v) => { setMulti(v); if (!v) setMaxChoices(1); }} label="Mehrfachwahl erlauben" />
            <div>
              <label className="form-label">max_choices</label>
              <input
                type="number"
                className={inputClass}
                min={1}
                max={Math.max(1, options.length)}
                value={maxChoices}
                onChange={(e) => setMaxChoices(Math.max(1, Math.min(options.length, Number(e.target.value) || 1)))}
                disabled={!multi}
              />
            </div>
            <Switch checked={allowChange} onChange={setAllowChange} label="Ändern der Stimme erlauben" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label">Optionen ({options.length})</label>
              <button className={btnBase} onClick={addOption}>+ Option</button>
            </div>
            <ul className="grid gap-2">
              {options.map((opt, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2">
                  <span className="text-sm text-gray-500 w-6 text-right">{i + 1}.</span>
                  <input className={inputClass} value={opt} onChange={(e) => setOptionAt(i, e.target.value)} />
                  <button className={btnBase} disabled={i === 0} onClick={() => moveOption(i, -1)}>↑</button>
                  <button className={btnBase} disabled={i === options.length - 1} onClick={() => moveOption(i, +1)}>↓</button>
                  <button className={btnBase} onClick={() => removeOption(i)}>Entfernen</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PollsAdminClient() {
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ open: boolean; poll: PollRow | null }>({ open: false, poll: null });
  const [counts, setCounts] = useState<Record<string, CountRow[]>>({});
  const [msg, setMsg] = useState('');

  const filtered = useMemo(() => {
    const f = q.trim().toLowerCase();
    if (!f) return polls;
    return polls.filter(p =>
      `${p.id} ${p.question}`.toLowerCase().includes(f)
      || p.options.some(o => o.toLowerCase().includes(f))
    );
  }, [polls, q]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await authedFetch('/api/admin/polls');
    const j = await r.json().catch(() => ({}));
    setPolls(Array.isArray(j?.data) ? j.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadCounts(pollId: string) {
    const r = await authedFetch(`/api/admin/polls/${encodeURIComponent(pollId)}/counts`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j?.data)) {
      setCounts(prev => ({ ...prev, [pollId]: j.data }));
    }
  }

  async function closeOrOpen(p: PollRow) {
    const closed = !!p.closed_at;
    const body = { closedAt: closed ? null : new Date().toISOString() };
    const r = await authedFetch(`/api/admin/polls/${encodeURIComponent(p.id)}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error ?? 'Aktion fehlgeschlagen'); return; }
    await load();
  }

  async function remove(p: PollRow) {
    if (!confirm(`Abstimmung "${p.question}" wirklich löschen?`)) return;
    const r = await authedFetch(`/api/admin/polls/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j.error ?? 'Löschen fehlgeschlagen'); return; }
    setMsg('Abstimmung gelöscht.');
    await load();
  }

  function totalVotes(rows: CountRow[] | undefined) {
    return (rows ?? []).reduce((acc, r) => acc + (r.votes || 0), 0);
  }

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Abstimmungen</h1>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2">
        <input
          className={inputClass + ' w-80'}
          placeholder="Suche (Frage/Optionen/ID)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className={btnBase} onClick={() => load()}>Aktualisieren</button>
        <button className={btnPrimary} onClick={() => setModal({ open: true, poll: null })}>Neue Abstimmung</button>
      </div>

      {msg && <div className="text-sm text-gray-600 dark:text-gray-300">{msg}</div>}

      {/* Liste */}
      <div className={cardClass}>
        {loading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Frage</th>
                  <th className="px-3 py-2">Optionen</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Votes</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const c = counts[p.id];
                  const total = totalVotes(c);
                  return (
                    <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="px-3 py-2 font-mono">{p.id}</td>
                      <td className="px-3 py-2">{p.question}</td>
                      <td className="px-3 py-2">
                        <ul className="list-disc pl-4 space-y-0.5">
                          {p.options.map((o, idx) => <li key={idx}>{o}</li>)}
                        </ul>
                      </td>
                      <td className="px-3 py-2">
                        {p.multi_choice ? `Mehrfach (max ${p.max_choices})` : 'Einzelauswahl'}
                        <div className="text-xs text-gray-500">Änderung {p.allow_change ? 'erlaubt' : 'gesperrt'}</div>
                      </td>
                      <td className="px-3 py-2">
                        {p.closed_at
                          ? <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 border-gray-200 dark:border-gray-700">geschlossen</span>
                          : <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 border-green-300 dark:border-green-800">offen</span>
                        }
                      </td>
                      <td className="px-3 py-2 min-w-[260px]">
                        {!c ? (
                          <button className="text-blue-600 underline" onClick={() => loadCounts(p.id)}>
                            Ergebnisse laden
                          </button>
                        ) : (
                          <div className="space-y-1">
                            {p.options.map((label, idx) => {
                              const row = c.find(r => r.option_index === idx);
                              const v = row?.votes ?? 0;
                              const pct = total ? Math.round((v / total) * 100) : 0;
                              return (
                                <div key={idx}>
                                  <div className="flex justify-between text-xs">
                                    <span className="truncate mr-2">{label}</span>
                                    <span className="tabular-nums">{v} · {pct}%</span>
                                  </div>
                                  <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded">
                                    <div
                                      className="h-2 bg-blue-600 dark:bg-blue-500 rounded"
                                      style={{ width: `${pct}%` }}
                                      aria-label={`${label}: ${pct}%`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            <div className="text-xs text-gray-500 pt-1">Gesamt: {total}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                        <button className={btnBase} onClick={() => setModal({ open: true, poll: p })}>Bearbeiten</button>
                        <button className={btnBase} onClick={() => closeOrOpen(p)}>
                          {p.closed_at ? 'Öffnen' : 'Schließen'}
                        </button>
                        <a
                          className={btnBase}
                          href={`/api/admin/polls/${encodeURIComponent(p.id)}/votes`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Votes
                        </a>
                        <button className={btnBase} onClick={() => remove(p)}>Löschen</button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-sm text-gray-500">Keine Abstimmungen gefunden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal mounten */}
      <PollModal
        open={modal.open}
        onClose={() => setModal({ open: false, poll: null })}
        poll={modal.poll}
        onSaved={() => load()}
      />
    </div>
  );
}
