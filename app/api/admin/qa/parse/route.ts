/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

// Robustes Parsing für deutsche CSV/TSV-Exports (UTF-8).
// Erkennt Trennzeichen (\t, ;, ,) und mappt:
// Feedback-ID | Verursacher | Verursacher Team | Melder | Melder Team | Booking-ID | Fehlertyp | Kommentar | Datum

function normalizeHeader(h: string){
  const map: Record<string, string> = { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' };
  // eslint-disable-next-line prefer-const
  let s = h.replace(/^\uFEFF/, '') // BOM entfernen
           .trim().toLowerCase()
           .replace(/[äöüß]/g, ch => map[ch] || ch)
           .replace(/[^a-z0-9]+/g, '_')
           .replace(/^_+|_+$/g,'');
  return s;
}

// Wählt den Delimiter, der über die ersten Zeilen die stabilste/größte Spaltenzahl ergibt.
function detectDelimiter(lines: string[]){
  const candidates: string[] = ['\t','; ',',']; // Tab, Semikolon, Komma
  const sample = lines.slice(0, Math.min(lines.length, 10)).map(l => l.replace(/^\uFEFF/, ''));

  const score = (d:string) => {
    const counts = sample.map(l => l.split(d).length);
    // Wir bevorzugen Delimiter mit >1 Spalten; Metrik: Median, dann Max als Tiebreaker
    const sorted = counts.slice().sort((a,b)=>a-b);
    const median = sorted[Math.floor(sorted.length/2)] || 0;
    const max = Math.max(...counts);
    return { median, max };
  };

  const ranked = candidates
    .map(d => ({ d, ...score(d) }))
    .sort((a,b) => (b.median - a.median) || (b.max - a.max));
  const best = ranked[0];

  // Fallback auf Semikolon, falls nichts Sinnvolles gefunden wird
  return (best && (best.median > 1 || best.max > 1)) ? best.d : ';';
}

function parseGermanDate(s?: string|null){
  if (!s) return null;
  // z.B. "16.09.25 07:22" oder "16.09.2025 07:22"
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return s; // wenn unbekanntes Format, Rohwert zurückgeben
  const dd = parseInt(m[1],10), MM = parseInt(m[2],10), yy = parseInt(m[3],10);
  const HH = m[4] ? parseInt(m[4],10) : 0;
  const mm = m[5] ? parseInt(m[5],10) : 0;
  const year = (m[3].length===2) ? (yy>=70 ? 1900+yy : 2000+yy) : yy; // 00–69 => 2000–2069
  const dt = new Date(Date.UTC(year, MM-1, dd, HH, mm));
  return isNaN(dt.getTime()) ? s : dt.toISOString();
}

function parseCSV(text: string){
  // Zeilen holen (auch leere am Ende raus)
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length===0) return [];

  const delim = detectDelimiter(lines);

  // Header parsen + normalisieren (BOM weg)
  const headerRaw = lines[0].replace(/^\uFEFF/, '').split(delim).map(s=>s.trim());
  const header = headerRaw.map(normalizeHeader);

  const idx = (keys: string[]) => header.findIndex(h => keys.includes(h));

  // Mapping der relevanten Spalten (case-insensitive dank normalizeHeader)
  const i_ts           = idx(['datum','ts','timestamp']);
  const i_type         = idx(['fehlertyp','incident_type','typ']);
  const i_category     = idx(['category','kategorie']);          // optional
  const i_severity     = idx(['severity','gewichtung','score']); // optional
  const i_desc         = idx(['kommentar','description','beschreibung']);
  const i_booking      = idx(['booking_id','bookingid','booking','buchungsnummer','bnr','booking_id_']);
  const i_agent_name   = idx(['verursacher','agent_name','berater','name']);
  const i_agent_first  = idx(['agent_first','vorname']);
  const i_agent_last   = idx(['agent_last','nachname']);

  const rows = lines.slice(1).map(line => {
    const parts = line.split(delim);
    const val = (i: number) => (i>=0 ? (parts[i]?.trim() || null) : null);
    const tsRaw = val(i_ts);
    const parsedTs = parseGermanDate(tsRaw);
    return {
      ts: parsedTs, // ISO wenn parsebar, sonst Originalstring
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
