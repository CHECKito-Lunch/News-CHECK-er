/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

function normalizeHeader(h: string){
  const map: Record<string, string> = { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' };
  let s = h.replace(/^\uFEFF/, '')
           .trim().toLowerCase()
           .replace(/[äöüß]/g, ch => map[ch] || ch)
           .replace(/[^a-z0-9]+/g, '_')
           .replace(/^_+|_+$/g,'');
  return s;
}

// --- NEU: quoted-aware Splitter für 1-Zeichen-Delimiter ---
function splitQuoted(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Doppelte Quotes innerhalb eines quoted Feldes -> als ein Quote interpretieren
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // Skip das zweite "
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

// Kandidaten inkl. Fallback: 2+ Whitespaces
type Splitter = { label: string; split: (s: string) => string[] };

function buildCandidates(): Splitter[] {
  return [
    { label: '\\t', split: (s) => splitQuoted(s, '\t') }, // ← statt s.split('\t')
    { label: ';',  split: (s) => splitQuoted(s, ';')  },
    { label: ',',  split: (s) => splitQuoted(s, ',')  },
    // Fallback nur ohne Quotes sicher – reicht hier als letzte Option (Copy/Paste Fälle)
    { label: '\\s{2,}', split: (s) => s.trim().split(/\s{2,}/) },
  ];
}

function pickSplitter(lines: string[]): Splitter {
  const header = (lines.find(l => l.trim().length>0) || '').replace(/^\uFEFF/,'');
  const candidates = buildCandidates();
  const scored = candidates.map(c => ({ c, cols: c.split(header).length }));
  scored.sort((a,b)=> b.cols - a.cols);
  return scored[0].cols > 1 ? scored[0].c : candidates[candidates.length-1];
}

// immer string zurückgeben → TS-typsicher
function dequote(v?: string | null): string {
  if (v == null) return '';
  let s = v.trim();
  // äußere "…"-Hülle entfernen und "" → "
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

function parseGermanDate(s?: string|null){
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return s;
  const dd = parseInt(m[1],10), MM = parseInt(m[2],10), yy = parseInt(m[3],10);
  const HH = m[4] ? parseInt(m[4],10) : 0;
  const mm = m[5] ? parseInt(m[5],10) : 0;
  const year = (m[3].length===2) ? (yy>=70 ? 1900+yy : 2000+yy) : yy;
  const dt = new Date(Date.UTC(year, MM-1, dd, HH, mm));
  return isNaN(dt.getTime()) ? s : dt.toISOString();
}

function parseCSV(text: string){
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length===0) return [];

  const splitter = pickSplitter(lines);

  // Header parsen + normalisieren
  const headerRaw: string[] = splitter.split(lines[0].replace(/^\uFEFF/, '')).map(s => dequote(s));
  const header: string[] = headerRaw.map(h => normalizeHeader(h));

  const idx = (keys: string[]) => header.findIndex(h => keys.includes(h));

  const i_ts           = idx(['datum','ts','timestamp']);
  const i_type         = idx(['fehlertyp','incident_type','typ']);
  const i_category     = idx(['category','kategorie']);
  const i_severity     = idx(['severity','gewichtung','score']);
  const i_desc         = idx(['kommentar','description','beschreibung']);
  const i_booking      = idx(['booking_id','bookingid','booking','buchungsnummer','bnr','booking_id_']);
  const i_agent_name   = idx(['verursacher','agent_name','berater','name']);
  const i_agent_first  = idx(['agent_first','vorname']);
  const i_agent_last   = idx(['agent_last','nachname']);

  const rows = lines.slice(1).map(line => {
    // --- NEU: quoted-aware Split pro Zeile ---
    const parts: string[] = splitter.split(line).map(p => dequote(p));
    const val = (i: number) => (i>=0 ? ((parts[i] ?? '').trim() || null) : null);
    const tsRaw = val(i_ts);
    const parsedTs = parseGermanDate(tsRaw);
    return {
      ts: parsedTs,
      incident_type: val(i_type),
      category: val(i_category),
      severity: val(i_severity),
      description: val(i_desc),
      booking_number: val(i_booking),
      agent_first: val(i_agent_first),
      agent_last: val(i_agent_last),
      agent_name: val(i_agent_name),
    };
  });

  return rows;
}

export async function POST(req: NextRequest){
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ ok:false, error:'no_file' }, { status: 400 });
  const text = await file.text();
  const rows = parseCSV(text);
  return NextResponse.json({ ok:true, rows });
}
