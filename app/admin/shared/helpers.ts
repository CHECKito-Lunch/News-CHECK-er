// app/admin/_shared/helpers.ts
export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toLocalInput(iso?: string|null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string) {
  return new Date(local).toISOString();
}

export function statusDE(s: 'draft' | 'scheduled' | 'published') {
  if (s === 'draft') return 'Entwurf';
  if (s === 'scheduled') return 'Geplant';
  return 'Veröffentlicht';
}
