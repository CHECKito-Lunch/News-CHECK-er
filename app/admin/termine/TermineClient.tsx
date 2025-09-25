'use client';

import { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import iCalendarPlugin from '@fullcalendar/icalendar';
import interactionPlugin from '@fullcalendar/interaction';

// --- Typen -----------------------------------------------------------
export type Termin = {
  id: number;
  title: string;
  // Server: starts_at ist erforderlich
  starts_at: string; // ISO-Date (yyyy-mm-dd)
  ends_at?: string | null; // optional, inklusiv in DB (UI/FC macht exklusiv)
  allDay?: boolean | null; // optional (Standard: ganztägig)
  icon?: string | null; // z.B. "📌", "🎓", "🎉" usw.
  // Rückwärtskompatibilität (falls alte API Felder liefert)
  start?: string;
  end?: string | null;
  date?: string; // legacy
};

// --- UI Tokens -------------------------------------------------------
const input = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
const card  = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';
const primary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white';

// Kleine, schlanke Icon-Palette (Emoji) --------------------------------
const ICONS = ['📌','🎓','🎉','🏖️','🏢','🗓️','🧪','🏆','📣','💡','🤝','🚀','🟢','🔵','🟡','🟣'];

// Helfer zum Datumsformat (de) -----------------------------------------
function fmtDate(d: Date) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AdminTerminePage() {
  const [rows, setRows] = useState<Termin[]>([]);
  const [loading, setLoading] = useState(false);

  // Create-Form (schlank)
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState<string>(''); // erforderlich
  const [endsAt, setEndsAt] = useState<string>(''); // optional; leer => Eintages-Termin
  const [icon, setIcon] = useState<string>('📌');

  // Modal-Editing
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Termin | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editIcon, setEditIcon] = useState<string>('📌');

  const canSaveCreate = useMemo(() => title.trim() && startsAt.trim(), [title, startsAt]);
  const canSaveEdit = useMemo(() => editTitle.trim() && editStartsAt.trim(), [editTitle, editStartsAt]);

  // --- Daten laden ---------------------------------------------------
  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/termine');
    const j = await r.json();
    const list: Termin[] = (j.data ?? []).map((t: any) => ({
      id: t.id,
      title: t.title,
      starts_at: t.starts_at || t.start || t.date || t.start_date || '',
      ends_at: t.ends_at ?? t.end ?? t.end_date ?? null,
      allDay: t.allDay ?? true,
      icon: t.icon ?? '📌',
      start: t.start,
      end: t.end,
      date: t.date,
    }));
    setRows(list);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetCreate() {
    setTitle(''); setStartsAt(''); setEndsAt(''); setIcon('📌');
  }

  async function createTermin() {
    const body: any = {
      title: title.trim(),
      starts_at: startsAt,
      ends_at: endsAt || null,
      allDay: true,
      icon,
      // Kompat für alte Backends
      start: startsAt,
      end: endsAt || null,
      date: startsAt,
    };

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
    const s = t.starts_at || t.start || t.date || '';
    const e = t.ends_at || t.end || '';
    setEditItem(t);
    setEditTitle(t.title);
    setEditStartsAt(s);
    setEditEndsAt(e || '');
    setEditIcon(t.icon || '📌');
    setModalOpen(true);
  }

  async function saveEdit() {
    if (!editItem) return;
    const body: any = {
      title: editTitle.trim(),
      starts_at: editStartsAt,
      ends_at: editEndsAt || null,
      allDay: true,
      icon: editIcon,
      // Kompat
      start: editStartsAt,
      end: editEndsAt || null,
      date: editStartsAt,
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
    ...rows.map(t => {
      const s = t.starts_at || t.start || t.date; // Fallback für alte Daten
      const e = t.ends_at || t.end || undefined;
      return {
        id: String(t.id),
        title: t.title, // kein Icon im Title, Icon separat rendern
        start: s,
        end: e || undefined, // FullCalendar erwartet exclusive end
        allDay: true,
        backgroundColor: '#2563eb',
        textColor:'#fff',
        extendedProps: { terminId: t.id, icon: t.icon || '📌', source: 'manual' },
      };
    }),
    // ICS-Quellen (keine Icons, werden im Renderer generisch angezeigt)
    { url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical', format:'ics' },
    { url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics', format:'ics' },
  ]), [rows]);

  // Custom Event Renderer, der ZeitRANGE & Icon sauber zeigt ------------
  function renderEventContent(arg: any) {
    const ev = arg.event;
    const isAllDay = ev.allDay;
    const start: Date | null = ev.start ? new Date(ev.start) : null;
    const endExclusive: Date | null = ev.end ? new Date(ev.end) : null;
    // Bei Ganztägig ist end exklusiv → für Anzeige -1 Tag
    const endInclusive = endExclusive && isAllDay ? new Date(endExclusive.getTime() - 86400000) : endExclusive;

    // Zeittext: für Ganztägig entweder "ganztägig" oder "DD.MM.YYYY – DD.MM.YYYY"
    let timeText = arg.timeText || '';
    if (isAllDay && start) {
      if (endInclusive && start.toDateString() !== endInclusive.toDateString()) {
        timeText = `${fmtDate(start)} – ${fmtDate(endInclusive)}`;
      } else {
        timeText = 'ganztägig';
      }
    }

    // Icon-Logik: manuelle Events → extendedProps.icon; ICS → generisch
    let icon = (ev.extendedProps && (ev.extendedProps as any).icon) || '';
    if (!icon) {
      const url = (ev as any).source?.url as string | undefined;
      if (url?.includes('schulferien')) icon = '🏖️';
      else if (url?.includes('feiertage-api')) icon = '🎌';
      else icon = '📅';
    }

    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        {timeText && <span className="opacity-70 whitespace-nowrap">{timeText}</span>}
        <span className="opacity-40">·</span>
        <span className="text-base leading-none">{icon}</span>
        <span className="font-medium truncate">{ev.title}</span>
      </div>
    );
  }

  // --- Render --------------------------------------------------------
  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold">Termine verwalten</h1>

      {/* Create (schlank) */}
      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">Neuen Termin anlegen</h2>
        <div className="grid md:grid-cols-7 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="form-label">Titel</label>
            <div className="flex items-center gap-2">
              <span className="text-xl" title="Icon">{icon}</span>
              <input className={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="z. B. Q3 Review" />
            </div>
          </div>
          <div>
            <label className="form-label">Start*</label>
            <input className={input} required type="date" value={startsAt} onChange={e=>setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Ende (optional)</label>
            <input className={input} type="date" value={endsAt} onChange={e=>setEndsAt(e.target.value)} min={startsAt || undefined} />
          </div>
          <div>
            <label className="form-label">Icon</label>
            <div className="flex flex-wrap gap-1">
              {ICONS.map(i => (
                <button key={i} type="button" onClick={()=>setIcon(i)} className={`px-2 py-1 rounded-lg border ${icon===i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700'}`}>{i}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 md:col-span-1">
            <button disabled={!canSaveCreate} onClick={createTermin} className={primary} type="button">Speichern</button>
            <button onClick={resetCreate} className={btn} type="button">Neu</button>
          </div>
        </div>
        <p className="text-xs text-gray-500">* Pflichtfeld. Lässt du "Ende" leer, wird automatisch ein eintägiger Termin angelegt.</p>
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
            const s = info.startStr.slice(0,10);
            const e = info.end ? new Date(info.end) : null; // exclusive
            if (e) e.setDate(e.getDate()-1); // inclusive UI
            setStartsAt(s);
            setEndsAt(e ? e.toISOString().slice(0,10) : s);
          }}
          events={calendarEvents}
          eventContent={renderEventContent}
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
                  <th className="px-3 py-2">Icon</th>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Von</th>
                  <th className="px-3 py-2">Bis</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(t => {
                  const von = (t.starts_at || t.start || t.date) ? new Date(t.starts_at || t.start || (t.date as string)) : null;
                  const bis = (t.ends_at || t.end) ? new Date((t.ends_at || t.end) as string) : von;
                  return (
                    <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2 text-xl">{t.icon || '📌'}</td>
                      <td className="px-3 py-2 font-medium">{t.title}</td>
                      <td className="px-3 py-2">{von ? fmtDate(von) : '—'}</td>
                      <td className="px-3 py-2">{bis ? fmtDate(bis) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button className={btn} onClick={()=>openEditModal(t)}>Bearbeiten</button>
                          <button className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white" onClick={()=>del(t.id)}>Löschen</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length===0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Keine Termine.</td></tr>}
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
            <div className="grid md:grid-cols-7 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="form-label">Titel</label>
                <div className="flex items-center gap-2">
                  <span className="text-xl" title="Icon">{editIcon}</span>
                  <input className={input} value={editTitle} onChange={e=>setEditTitle(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Start*</label>
                <input className={input} required type="date" value={editStartsAt} onChange={e=>setEditStartsAt(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Ende (optional)</label>
                <input className={input} type="date" value={editEndsAt} onChange={e=>setEditEndsAt(e.target.value)} min={editStartsAt || undefined} />
              </div>
              <div>
                <label className="form-label">Icon</label>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map(i => (
                    <button key={i} type="button" onClick={()=>setEditIcon(i)} className={`px-2 py-1 rounded-lg border ${editIcon===i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700'}`}>{i}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 md:col-span-1">
                <button disabled={!canSaveEdit} onClick={saveEdit} className={primary} type="button">Speichern</button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">* Pflichtfeld. Wenn kein Ende gesetzt ist, wird der Termin als eintägig gespeichert.</p>
          </div>
        </div>
      )}
    </div>
  );
}
