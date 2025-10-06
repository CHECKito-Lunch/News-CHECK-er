// app/api/admin/feedback/parse/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

type Row = Record<string, any>;

function detectEncoding(buf: Buffer): 'utf8' | 'utf16le' | 'utf16be' | 'win1252' {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf8';
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return 'utf16le';
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return 'utf16be';

  // simple UTF-8 validity check
  let i = 0, ok = true;
  while (i < buf.length) {
    const b = buf[i];
    if (b <= 0x7F) { i++; continue; }
    if ((b & 0xE0) === 0xC0 && i + 1 < buf.length && (buf[i+1] & 0xC0) === 0x80) { i += 2; continue; }
    if ((b & 0xF0) === 0xE0 && i + 2 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80) { i += 3; continue; }
    if ((b & 0xF8) === 0xF0 && i + 3 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80 && (buf[i+3] & 0xC0) === 0x80) { i += 4; continue; }
    ok = false; break;
  }
  if (ok) return 'utf8';
  return 'win1252';
}

function decodeToUtf8(buf: Buffer): string {
  const enc = detectEncoding(buf);
  if (enc === 'utf8') {
    // strip BOM if present
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return buf.slice(3).toString('utf8');
    }
    return buf.toString('utf8');
  }
  if (enc === 'utf16le') return iconv.decode(buf, 'utf16-le');
  if (enc === 'utf16be') return iconv.decode(buf, 'utf16-be');
  return iconv.decode(buf, 'win1252'); // CP1252
}

function detectDelimiter(sample: string): ',' | ';' | '\t' {
  const head = sample.split(/\r?\n/).slice(0, 5).join('\n');
  const count = (s: string, ch: string) => (s.match(new RegExp(`\\${ch}`, 'g')) || []).length;
  const commas = count(head, ',');
  const semis  = count(head, ';');
  const tabs   = count(head, '\t');
  if (semis >= commas && semis >= tabs) return ';';
  if (tabs  >= commas && tabs  >= semis) return '\t';
  return ',';
}

// Normalisierung der Spaltennamen (wird nur intern zur Suche benutzt)
function normKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9 _-]/g,'')
    .replace(/\s+/g, '_');
}

const truthy = new Set(['ja','yes','y','true','1','x','✓','✔']);
const falsy  = new Set(['nein','no','n','false','0']);

function toBoolLike(v: any): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === '–' || s === '-') return null;
  if (truthy.has(s)) return 'ja';
  if (falsy.has(s)) return 'nein';
  return null; // als Text nicht erzwingen – Import mapped erneut
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Holt Wert aus verschiedenen möglichen Header-Schreibweisen
function pick(r: Row, candidates: string[]): any {
  for (const key of candidates) {
    if (r[key] != null && r[key] !== '') return r[key];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok:false, error:'file missing' }, { status: 400 });
    }

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const text = decodeToUtf8(buf);
    const delimiter = detectDelimiter(text);

    const parsed = Papa.parse<Row>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      delimiter,
      transformHeader: normKey,
      transform: (val) => {
        const s = String(val ?? '').trim();
        return s === '—' || s === '-' ? '' : val;
      }
    });

    if (parsed.errors?.length) {
      const first = parsed.errors[0];
      return NextResponse.json({ ok:false, error:`CSV-Fehler: ${first.message} (row ${first.row})` }, { status: 400 });
    }

    // Zeilen mappen → exakt die Keys liefern, die dein Import erwartet
    const rows = (parsed.data || []).map((r) => {
      // Mögliche Header-Varianten (alle ↓ sind bereits normKey-transformiert)
      const ts               = pick(r, ['ts','datum','date','erhalten']);
      const bewertung        = pick(r, ['bewertung']);
      const freundlichkeit   = pick(r, ['beraterfreundlichkeit','freundlichkeit','f']);
      const qualifikation    = pick(r, ['beraterqualifikation','qualifikation','q']);
      const angebotsattr     = pick(r, ['beratungsangebotsattraktivitaet','angebotsattraktivitaet','a']);
      const kommentar        = pick(r, ['kommentar','comment','kommentar_raw','kommentar_text']);
      const templateName     = pick(r, ['template_name','template','template_name','vorlagenname','template_name']);
      const rekla            = pick(r, ['rekla','reklamation']);
      const geklaert         = pick(r, ['anliegen_geklaert','anliegen_geklaert?','anliegen_geklaert','geklärt','geklart','geklaert']);
      const feedbacktyp      = pick(r, ['feedbacktyp','channel','kanal']);

      // 🆕 Buchung & Agent
      const bookingNumber    = pick(r, ['buchungsnummer','booking_number','buchung','buchung_id']);
      const agentFirst       = pick(r, ['beratervorname','agent_first','vorname']);
      const agentLast        = pick(r, ['beraternachname','agent_last','nachname']);
      const agentName        = pick(r, ['bearbeiter','agent_name','berater','mitarbeiter','name']);

      const out = {
        // Zeit / Pflicht
        ts: ts || null,

        // Scores
        bewertung: toNumber(bewertung),
        beraterfreundlichkeit: toNumber(freundlichkeit),
        beraterqualifikation:  toNumber(qualifikation),
        beratungsangebotsattraktivitaet: toNumber(angebotsattr),

        // Texte
        kommentar: kommentar ?? null,
        template_name: templateName ?? null,

        // Flags (als „ja“/„nein“ oder null)
        rekla: toBoolLike(rekla),
        geklaert: toBoolLike(geklaert),

        // Kanal
        feedbacktyp: feedbacktyp ?? null,

        // 🆕 Buchung & Agent
        booking_number: bookingNumber ?? null,
        agent_first: agentFirst ?? null,
        agent_last: agentLast ?? null,
        agent_name: agentName ?? null,
      };

      // Strings trimmen
      for (const k of Object.keys(out)) {
        const v = (out as any)[k];
        if (typeof v === 'string') (out as any)[k] = v.trim();
      }
      return out;
    });

    // Leere Zeilen filtern (falls Headerzeile ohne Daten o.Ä.)
    const cleaned = rows.filter(r =>
      Object.values(r).some(v => v !== null && String(v).trim() !== '')
    );

    return NextResponse.json({ ok:true, rows: cleaned });
  } catch (e:any) {
    console.error('[feedback/parse]', e);
    return NextResponse.json({ ok:false, error:'Parsing fehlgeschlagen' }, { status: 500 });
  }
}
