'use client';


import { useEffect, useMemo, useState } from 'react';
import AdminTabs from '../shared/AdminTabs';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import iCalendarPlugin from '@fullcalendar/icalendar';
import interactionPlugin from '@fullcalendar/interaction';

type Termin = { id:number; title:string; date:string };

const input = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
const card  = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';
const primary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white';

export default function AdminTerminePage() {
  const [rows, setRows] = useState<Termin[]>([]);
  const [loading, setLoading] = useState(false);

  const [editId, setEditId] = useState<number|null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string>('');

  const canSave = useMemo(() => title.trim() && date.trim(), [title, date]);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/termine');
    const j = await r.json();
    setRows(j.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setEditId(null); setTitle(''); setDate('');
  }

  async function save() {
    const body = { title: title.trim(), date };
    const url = editId ? `/api/admin/termine/${editId}` : '/api/admin/termine';
    const method = editId ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Fehler beim Speichern');
      return;
    }
    await load();
    if (!editId) resetForm();
  }

  function startEdit(t: Termin) {
    setEditId(t.id); setTitle(t.title); setDate(t.date);
    window.scrollTo({ top: 0, behavior:'smooth' });
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
    if (editId===id) resetForm();
  }

  const calendarEvents = [
    ...rows.map(t => ({
      title: '📌 ' + t.title, start: t.date, allDay: true, backgroundColor: '#2563eb', textColor:'#fff'
    })),
    { url: 'https://feiertage-api.de/api/?bundesland=SN&out=ical', format:'ics' },
    { url: 'https://www.schulferien.org/iCal/Ferien/ical/Sachsen.ics', format:'ics' },
  ];

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold">Termine verwalten</h1>
      <AdminTabs />

      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">{editId ? `Bearbeiten (ID ${editId})` : 'Neuen Termin anlegen'}</h2>
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="form-label">Titel</label>
            <input className={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="z. B. Q3 Review" />
          </div>
          <div>
            <label className="form-label">Datum</label>
            <input className={input} type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button disabled={!canSave} onClick={save} className={primary} type="button">Speichern</button>
            <button onClick={resetForm} className={btn} type="button">Neu</button>
          </div>
        </div>
      </div>

      <div className={card + ' space-y-4'}>
        <h3 className="text-lg font-semibold">Kalender-Vorschau</h3>
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin, iCalendarPlugin, interactionPlugin]}
          initialView="listMonth"
          headerToolbar={{ start:'prev,next today', center:'title', end:'listMonth,dayGridMonth' }}
          locale="de"
          height={520}
          events={calendarEvents}
          eventClick={(info) => {
            const t = rows.find(x => x.title === info.event.title.replace(/^📌\s*/, '') && x.date === info.event.startStr.slice(0,10));
            if (t) startEdit(t);
          }}
        />
      </div>

      <div className={card}>
        {loading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                <tr>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 font-medium">{t.title}</td>
                    <td className="px-3 py-2">{new Date(t.date).toLocaleDateString('de-DE')}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button className={btn} onClick={()=>startEdit(t)}>Bearbeiten</button>
                        <button className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white" onClick={()=>del(t.id)}>Löschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length===0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">Keine Termine.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
