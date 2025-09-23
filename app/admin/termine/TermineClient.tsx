'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminTabs from '../shared/AdminTabs';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import iCalendarPlugin from '@fullcalendar/icalendar';
import interactionPlugin from '@fullcalendar/interaction';

// --- Typen -----------------------------------------------------------
export type Termin = {
  id: number;
  title: string;
  // neue Felder für Zeiträume
  start: string; // ISO-Date (yyyy-mm-dd)
  end?: string | null; // ISO-Date (exclusive end für FullCalendar; Backend darf inklusiv speichern)
  allDay?: boolean | null; // optional (Standard: ganztägig)
  // Rückwärtskompatibilität (falls API bisher nur "date" liefert)
  date?: string;
};

// --- UI Tokens -------------------------------------------------------
const input = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
const card  = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';
const primary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white';

export default function AdminTerminePage() {
  const [rows, setRows] = useState<Termin[]>([]);
  const [loading, setLoading] = useState(false);

  // Create-Form (schlank)
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>(''); // optional; wenn leer => Eintages-Termin

  // Modal-Editing
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Termin | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  const canSaveCreate = useMemo(() => title.trim() && start.trim(), [title, start]);
  const canSaveEdit = useMemo(() => editTitle.trim() && editStart.trim(), [editTitle, editStart]);

  // --- Daten laden ---------------------------------------------------
  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/termine');
    const j = await r.json();
    const list: Termin[] = (j.data ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      start: t.start || t.date || t.start_date || '',
      end: t.end ?? t.end_date ?? null,
      allDay: t.allDay ?? true,
    }));
    setRows(list);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetCreate() {
    setTitle(''); setStart(''); setEnd('');
  }

  async function createTermin() {
    const body = {
      title: title.trim(),
      start,
      end: end || null,
      allDay: true,
    };
    // Für alte APIs zusätzlich "date" mitsenden
    (body as any).date = start;

    const r = await fetch('/api/admin/termine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Fehler beim Speichern');
      return;
    }
    await load();
    resetCreate();
  }

  function openEditModal(t: Termin) {
    // Fallbacks für evtl. alte Daten
    const s = t.start || t.date || '';
    const e = t.end || '';
    setEditItem(t);
    setEditTitle(t.title);
    setEditStart(s);
    setEditEnd(e);
    setModalOpen(true);
  }

  async function saveEdit() {
    if (!editItem) return;
    const body = {
      title: editTitle.trim(),
      start: editStart,
      end: editEnd || null,
      allDay: true,
      // Kompatibilität
      date: editStart,
    };
    const r = await fetch(`/api/admin/termine/${editItem.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Fehler beim Speichern');
      return;
    }
    setModalOpen(false);
    setEditItem(null);
    await load();
  }

  async function del(id:number) {
    if (!confirm('Termin wirklich löschen?')) return;
    const r = await fetch(`/api/admin/termine/${id}`, { method:'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Löschen fehlgeschlagen');
      return;
    }
    await load();
  }

  // --- Kalenderdaten -------------------------------------------------
  const calendarEvents = useMemo(() => ([
    ...rows.map(t => ({
      id: String(t.id),
      title: '📌 ' + t.title,
      start: t.start || t.date, // Fallback
      end: t.end || undefined,  // FullCalendar erwartet exclusive end
      allDay: true,
      backgroundColor: '#2563eb',
      textColor:'#fff',
      extendedProps: { terminId: t.id },
    })),
    { url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical', format:'ics' },
    { url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics', format:'ics' },
  ]), [rows]);

  // --- Render --------------------------------------------------------
  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold">Termine verwalten</h1>
      <AdminTabs />

      {/* Create (schlank) */}
      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">Neuen Termin anlegen</h2>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="form-label">Titel</label>
            <input className={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="z. B. Q3 Review" />
          </div>
          <div>
            <label className="form-label">Start</label>
            <input className={input} type="date" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Ende (optional)</label>
            <input className={input} type="date" value={end} onChange={e=>setEnd(e.target.value)} min={start || undefined} />
          </div>
          <div className="flex gap-2 md:col-span-1">
            <button disabled={!canSaveCreate} onClick={createTermin} className={primary} type="button">Speichern</button>
            <button onClick={resetCreate} className={btn} type="button">Neu</button>
          </div>
        </div>
        <p className="text-xs text-gray-500">Hinweis: Lässt du "Ende" leer, wird automatisch ein eintägiger Termin angelegt.</p>
      </div>

      {/* Kalender-Vorschau */}
      <div className={card + ' space-y-4'}>
        <h3 className="text-lg font-semibold">Kalender-Vorschau</h3>
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin, iCalendarPlugin, interactionPlugin]}
          initialView="listMonth"
          headerToolbar={{ start:'prev,next today', center:'title', end:'listMonth,dayGridMonth' }}
          locale="de"
          height={520}
          selectable
          selectMirror
          select={(info) => {
            // Direkt ins Create-Form übernehmen
            const s = info.startStr.slice(0,10);
            // FullCalendar liefert exclusive end => für UI -1 Tag anzeigen
            const e = info.end ? new Date(info.end) : null;
            if (e) e.setDate(e.getDate()-1);
            setStart(s);
            setEnd(e ? e.toISOString().slice(0,10) : s);
          }}
          events={calendarEvents}
          eventClick={(info) => {
            const id = (info.event.extendedProps as any)?.terminId || Number(info.event.id);
            const t = rows.find(x => x.id === Number(id));
            if (t) openEditModal(t);
          }}
        />
      </div>

      {/* Liste */}
      <div className={card}>
        {loading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                <tr>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Von</th>
                  <th className="px-3 py-2">Bis</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(t => {
                  const von = (t.start || t.date) ? new Date(t.start || (t.date as string)) : null;
                  const bis = t.end ? new Date(t.end) : von;
                  return (
                    <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 font-medium">{t.title}</td>
                      <td className="px-3 py-2">{von ? von.toLocaleDateString('de-DE') : '—'}</td>
                      <td className="px-3 py-2">{bis ? bis.toLocaleDateString('de-DE') : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button className={btn} onClick={()=>openEditModal(t)}>Bearbeiten</button>
                          <button className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white" onClick={()=>del(t.id)}>Löschen</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length===0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Keine Termine.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal zum Bearbeiten */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={()=>setModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Termin bearbeiten</h3>
              <button className={btn} onClick={()=>setModalOpen(false)}>Schließen</button>
            </div>
            <div className="grid md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="form-label">Titel</label>
                <input className={input} value={editTitle} onChange={e=>setEditTitle(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Start</label>
                <input className={input} type="date" value={editStart} onChange={e=>setEditStart(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Ende (optional)</label>
                <input className={input} type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)} min={editStart || undefined} />
              </div>
              <div className="flex gap-2 md:col-span-1">
                <button disabled={!canSaveEdit} onClick={saveEdit} className={primary} type="button">Speichern</button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Wenn kein Ende gesetzt ist, wird der Termin als eintägig gespeichert!</p>
          </div>
        </div>
      )}
    </div>
  );
}