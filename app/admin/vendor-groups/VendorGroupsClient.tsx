'use client';
import { useEffect, useMemo, useState } from 'react';
import AdminTabs from '../shared/AdminTabs';

type Vendor = { id:number; name:string };
type Group = { id:number; name:string; members?: number[] };

export default function VendorGroups() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [vRes, gRes] = await Promise.all([
        fetch('/api/admin/vendors'),
        fetch('/api/admin/vendor-groups?withMembers=1')
      ]);
      const vJson = await vRes.json();
      const gJson = await gRes.json();
      setVendors(vJson.data ?? []);
      setGroups(gJson.data ?? []);
      if (!selectedGroupId && (gJson.data?.length ?? 0) > 0) {
        setSelectedGroupId(gJson.data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const selectedGroup = useMemo(
    () => groups.find(g => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const memberIds = new Set(selectedGroup?.members ?? []);

  const availableVendors = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return vendors.filter(v => {
      if (memberIds.has(v.id)) return false;
      if (!q) return true;
      return v.name.toLowerCase().includes(q);
    });
  }, [vendors, memberIds, filter]);

  async function createGroup() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/admin/vendor-groups', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name: newName }) });
    setCreating(false);
    if (res.ok) { setNewName(''); await load(); }
  }

  async function renameGroup(id:number, name:string) {
    await fetch(`/api/admin/vendor-groups/${id}`, { method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name }) });
    await load();
  }

  async function deleteGroup(id:number) {
    if (!confirm('Gruppe wirklich löschen?')) return;
    await fetch(`/api/admin/vendor-groups/${id}`, { method: 'DELETE' });
    await load();
    if (selectedGroupId === id) setSelectedGroupId(null);
  }

  async function addMember(vendorId:number) {
    if (!selectedGroup) return;
    await fetch(`/api/admin/vendor-groups/${selectedGroup.id}/members`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ vendor_id: vendorId }) });
    await load();
  }

  async function removeMember(vendorId:number) {
    if (!selectedGroup) return;
    await fetch(`/api/admin/vendor-groups/${selectedGroup.id}/members`, { method: 'DELETE', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ vendor_id: vendorId }) });
    await load();
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Veranstalter-Gruppen</h1>
         <AdminTabs />
        {loading && <span className="text-sm text-gray-500">lädt…</span>}
      </div>

      {/* Anlegen */}
      <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <div className="grid sm:grid-cols-4 gap-2 items-end">
        <div className="sm:col-span-3">
          <label className="form-label">Gruppenname</label>
          <input value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="z. B. Pauschalreise-Partner" />
        </div>
        <div>
          <button className="btn btn-primary" disabled={!newName || creating} onClick={createGroup}>Anlegen</button>
        </div>
      </div>
</div>
      {/* Gruppenliste + Auswahl */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 border rounded-xl p-3 space-y-2">
          <div className="text-sm text-gray-500 mb-1">Gruppen</div>
          <ul className="space-y-1">
            {groups.map(g => (
              <li key={g.id} className={`flex items-center gap-2 p-2 rounded-lg ${selectedGroupId===g.id?'bg-gray-50 dark:bg-gray-800':''}`}>
                <button className="text-left flex-1" onClick={()=>setSelectedGroupId(g.id)}>
                  <span className="font-medium">{g.name}</span>
                  <span className="ml-2 text-xs text-gray-500">({g.members?.length ?? 0})</span>
                </button>
                <button className="px-2 py-1 text-xs border rounded-lg bg-white hover:bg-gray-50" onClick={()=>{
                  const n = prompt('Neuer Name', g.name);
                  if (n && n !== g.name) renameGroup(g.id, n);
                }}>Umbenennen</button>
                <button className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg" onClick={()=>deleteGroup(g.id)}>Löschen</button>
              </li>
            ))}
            {groups.length===0 && <li className="text-sm text-gray-500">Noch keine Gruppen.</li>}
          </ul>
        </div>

        {/* Mitgliederverwaltung */}
        <div className="md:col-span-2 border rounded-xl p-3">
          {!selectedGroup ? (
            <div className="text-sm text-gray-500">Wähle links eine Gruppe aus.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Links: verfügbare Vendors */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Verfügbare Veranstalter</div>
                  <input
                    className="w-40"
                    value={filter}
                    onChange={(e)=>setFilter(e.target.value)}
                    placeholder="Suchen…"
                  />
                </div>
                <ul className="max-h-72 overflow-auto space-y-1">
                  {availableVendors.map(v=>(
                    <li key={v.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      <span>{v.name}</span>
                      <button className="px-2 py-1 text-xs border rounded-lg bg-white hover:bg-gray-50" onClick={()=>addMember(v.id)}>Hinzufügen</button>
                    </li>
                  ))}
                  {availableVendors.length===0 && <li className="text-sm text-gray-500 p-2">Keine passenden Veranstalter.</li>}
                </ul>
              </div>

              {/* Rechts: Mitglieder */}
              <div>
                <div className="text-sm font-medium mb-2">Mitglieder in „{selectedGroup.name}“</div>
                <ul className="max-h-72 overflow-auto space-y-1">
                  {(selectedGroup.members ?? [])
                    .map(id => vendors.find(v=>v.id===id))
                    .filter((v): v is Vendor => !!v)
                    .map(v => (
                      <li key={v.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                        <span>{v.name}</span>
                        <button className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg" onClick={()=>removeMember(v.id)}>Entfernen</button>
                      </li>
                    ))
                  }
                  {(selectedGroup.members?.length ?? 0)===0 && <li className="text-sm text-gray-500 p-2">Noch keine Mitglieder.</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
