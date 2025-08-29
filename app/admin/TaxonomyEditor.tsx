'use client';

import { useEffect, useState } from 'react';

export type TaxoItem = {
  id: number;
  name: string;
  color?: string;
  kind?: string;
  // NEU: nur relevant für Kategorien
  show_vendor_filter?: boolean;
  show_badges_filter?: boolean;
  show_search_filter?: boolean;
};

type Props = {
  title: string;
  endpoint: string; // z.B. '/api/admin/categories'
  columns?: Array<'name' | 'color' | 'kind'>;
  allowGroups?: boolean; // nur für Vendors
  /** Optional: erzwingt die Anzeige der drei Kategorie-Filter-Switches */
  showCategoryFlags?: boolean;
};

export default function TaxonomyEditor({
  title,
  endpoint,
  columns = ['name'],
  allowGroups,
  showCategoryFlags,
}: Props) {
  const [items, setItems] = useState<TaxoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#eeeeff');
  const [kind, setKind] = useState('default');
  const [error, setError] = useState<string | null>(null);

  // NEU: Create-Form Switches (Defaults true)
  const [fVendor, setFVendor] = useState(true);
  const [fBadges, setFBadges] = useState(true);
  const [fSearch, setFSearch] = useState(true);

  // Edit-Mode + Drafts
  const [isEditing, setIsEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, TaxoItem>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());

  const showColor = columns.includes('color');
  const showKind = columns.includes('kind');

  // Kategorien-Erkennung (falls Prop nicht gesetzt)
  const showFlags = (showCategoryFlags ?? endpoint.toLowerCase().includes('categories'));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      const list: TaxoItem[] = json.data ?? [];
      setItems(list);
      if (isEditing) {
        // bei aktivem Edit-Mode Drafts nachziehen (z. B. nach Create/Delete)
        setDrafts(Object.fromEntries(list.map((i) => [i.id, { ...i }])));
        setDirtyIds(new Set());
      }
    } catch {
      setError('Konnte Daten nicht laden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  // Edit-Mode toggeln
  function enterEdit() {
    setDrafts(Object.fromEntries(items.map((i) => [i.id, { ...i }])));
    setDirtyIds(new Set());
    setIsEditing(true);
  }
  function cancelEdit() {
    setIsEditing(false);
    setDrafts({});
    setDirtyIds(new Set());
  }

  // Create
  async function create() {
    setCreating(true);
    setError(null);
    try {
      const body: Partial<TaxoItem> = { name };
      if (showColor) body.color = color;
      if (showKind) body.kind = kind;
      if (showFlags) {
        body.show_vendor_filter = fVendor;
        body.show_badges_filter = fBadges;
        body.show_search_filter = fSearch;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      setName('');
      if (showColor) setColor('#eeeeff');
      if (showKind) setKind('default');
      if (showFlags) {
        setFVendor(true);
        setFBadges(true);
        setFSearch(true);
      }
      setCreating(false);
      await load();
    } catch {
      setError('Anlegen fehlgeschlagen.');
      setCreating(false);
    }
  }

  // Patch-Helper
  function buildPatch(original: TaxoItem, draft: TaxoItem): Partial<TaxoItem> {
    const patch: Partial<TaxoItem> = {};
    if (draft.name !== original.name) patch.name = draft.name;
    if (showColor && draft.color !== original.color) patch.color = draft.color;
    if (showKind && draft.kind !== original.kind) patch.kind = draft.kind;

    if (showFlags) {
      if (draft.show_vendor_filter !== original.show_vendor_filter)
        patch.show_vendor_filter = !!draft.show_vendor_filter;
      if (draft.show_badges_filter !== original.show_badges_filter)
        patch.show_badges_filter = !!draft.show_badges_filter;
      if (draft.show_search_filter !== original.show_search_filter)
        patch.show_search_filter = !!draft.show_search_filter;
    }

    return patch;
  }

  async function saveRow(id: number) {
    const original = items.find((i) => i.id === id);
    const draft = drafts[id];
    if (!original || !draft) return;

    const patch = buildPatch(original, draft);
    if (Object.keys(patch).length === 0) {
      // nichts geändert
      setDirtyIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      return;
    }

    const res = await fetch(`${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      // lokale Daten aktualisieren
      const updated = { ...original, ...patch };
      setItems((list) => list.map((i) => (i.id === id ? updated : i)));
      setDrafts((d) => ({ ...d, [id]: updated }));
      setDirtyIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function saveAll() {
    const ids = Array.from(dirtyIds);
    await Promise.all(ids.map((id) => saveRow(id)));
  }

  async function remove(id: number) {
    if (!confirm('Wirklich löschen?')) return;
    const res = await fetch(`${endpoint}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems((list) => list.filter((i) => i.id !== id));
      setDrafts((d) => {
        const n = { ...d };
        delete n[id];
        return n;
      });
      setDirtyIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  // Draft-Feldänderung (markiert Zeile als "dirty", aber kein Netzwerk-Request)
  function changeDraft<K extends keyof TaxoItem>(id: number, key: K, value: TaxoItem[K]) {
    setDrafts((prev) => {
      const current = prev[id] ?? items.find((i) => i.id === id)!;
      const next = { ...current, [key]: value };
      return { ...prev, [id]: next };
    });
    setDirtyIds((s) => new Set(s).add(id));
  }

  const dirtyCount = dirtyIds.size;

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>

        <div className="flex items-center gap-2">
          {loading && <span className="text-sm text-gray-500">lädt…</span>}
          {!isEditing ? (
            <button className="btn btn-outline" onClick={enterEdit} type="button">
              ✏️ Bearbeiten
            </button>
          ) : (
            <>
              <span className="text-sm text-gray-500">
                {dirtyCount > 0 ? `${dirtyCount} Änderung(en) nicht gespeichert` : 'Keine Änderungen'}
              </span>
              <button
                className="btn btn-primary"
                onClick={saveAll}
                type="button"
                disabled={dirtyCount === 0}
              >
                ✅ Alle speichern
              </button>
              <button className="btn btn-ghost" onClick={cancelEdit} type="button">
                Abbrechen
              </button>
            </>
          )}
        </div>
      </div>

      {/* Create */}
      <div className="grid md:grid-cols-4 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="form-label">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name…" />
        </div>
        {showColor && (
          <div>
            <label className="form-label">Farbe</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        )}
        {showKind && (
          <div>
            <label className="form-label">Typ</label>
            <input value={kind} onChange={(e) => setKind(e.target.value)} placeholder="z.B. warning/info" />
          </div>
        )}

        <div>
          <button className="btn btn-primary" disabled={!name || creating} onClick={create} type="button">
            Anlegen
          </button>
        </div>
      </div>

      {/* NEU: Create – Kategorie-Filter-Flags */}
      {showFlags && (
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={fVendor} onChange={(e) => setFVendor(e.target.checked)} />
            Veranstalter-Filter
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={fBadges} onChange={(e) => setFBadges(e.target.checked)} />
            Badges-Filter
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={fSearch} onChange={(e) => setFSearch(e.target.checked)} />
            Suche
          </label>
        </div>
      )}

      {error && <div className="text-sm text-red-500">{error}</div>}

      {/* List */}
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {items.map((it) => {
          const draft = drafts[it.id] ?? it;
          const isDirty = dirtyIds.has(it.id);

          return (
            <li key={it.id} className="py-3 flex items-center gap-3">
              {/* Name */}
              {isEditing ? (
                <input
                  className="w-60"
                  value={draft.name}
                  onChange={(e) => changeDraft(it.id, 'name', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRow(it.id)}
                />
              ) : (
                <span className="w-60 truncate">{it.name}</span>
              )}

              {/* Farbe */}
              {showColor && (
                <>
                  {isEditing ? (
                    <input
                      type="color"
                      value={draft.color ?? '#eeeeff'}
                      onChange={(e) => changeDraft(it.id, 'color', e.target.value)}
                    />
                  ) : (
                    <div
                      className="h-6 w-10 rounded border border-gray-200 dark:border-gray-700"
                      style={{ backgroundColor: it.color ?? '#eeeeff' }}
                    />
                  )}
                  <span
                    className="px-2 py-0.5 rounded-full text-xs border border-gray-200 dark:border-gray-700"
                    style={{ backgroundColor: (isEditing ? draft.color : it.color) ?? '#eee' }}
                  >
                    Vorschau
                  </span>
                </>
              )}

              {/* Kind */}
              {showKind && (
                isEditing ? (
                  <input
                    className="w-40"
                    value={draft.kind ?? ''}
                    onChange={(e) => changeDraft(it.id, 'kind', e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRow(it.id)}
                  />
                ) : (
                  <span className="w-40 truncate">{it.kind}</span>
                )
              )}

              {/* NEU: Kategorie-Filter-Flags */}
              {showFlags && (
                <div className="flex items-center gap-4">
                  {isEditing ? (
                    <>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!draft.show_vendor_filter}
                          onChange={(e) => changeDraft(it.id, 'show_vendor_filter', e.target.checked)}
                        />
                        Veranstalter
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!draft.show_badges_filter}
                          onChange={(e) => changeDraft(it.id, 'show_badges_filter', e.target.checked)}
                        />
                        Badges
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!draft.show_search_filter}
                          onChange={(e) => changeDraft(it.id, 'show_search_filter', e.target.checked)}
                        />
                        Suche
                      </label>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full border ${it.show_vendor_filter ? 'border-green-400 text-green-700' : 'border-gray-300 text-gray-500'}`}>
                        Veranstalter {it.show_vendor_filter ? '✓' : '✗'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full border ${it.show_badges_filter ? 'border-green-400 text-green-700' : 'border-gray-300 text-gray-500'}`}>
                        Badges {it.show_badges_filter ? '✓' : '✗'}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full border ${it.show_search_filter ? 'border-green-400 text-green-700' : 'border-gray-300 text-gray-500'}`}>
                        Suche {it.show_search_filter ? '✓' : '✗'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                {allowGroups && !isEditing && (
                  <a
                    href="/admin/vendor-groups"
                    className="btn btn-outline btn-sm"
                  >
                    Gruppen…
                  </a>
                )}

                {isEditing ? (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => saveRow(it.id)}
                      disabled={!isDirty}
                      type="button"
                    >
                      Speichern
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        // Draft der Zeile auf Original zurücksetzen
                        setDrafts((d) => ({ ...d, [it.id]: { ...it } }));
                        setDirtyIds((s) => {
                          const n = new Set(s);
                          n.delete(it.id);
                          return n;
                        });
                      }}
                      type="button"
                    >
                      Zurücksetzen
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => remove(it.id)}
                    type="button"
                  >
                    Löschen
                  </button>
                )}
              </div>
            </li>
          );
        })}

        {items.length === 0 && !loading && (
          <li className="py-4 text-sm text-gray-500">Noch keine Einträge.</li>
        )}
      </ul>
    </div>
  );
}