export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

type Row = Record<string, any>;

function detectEncoding(buf: Buffer): 'utf8' | 'utf16le' | 'utf16be' | 'win1252' {
  // BOMs
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf8';
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return 'utf16le';
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return 'utf16be';

  // Heuristik: UTF-8 gültig?
  const isLikelyUtf8 = (() => {
    let i = 0;
    while (i < buf.length) {
      const b = buf[i];
      if (b <= 0x7F) { i++; continue; }
      if ((b & 0xE0) === 0xC0 && i + 1 < buf.length &&
          (buf[i+1] & 0xC0) === 0x80) { i += 2; continue; }
      if ((b & 0xF0) === 0xE0 && i + 2 < buf.length &&
          (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80) { i += 3; continue; }
      if ((b & 0xF8) === 0xF0 && i + 3 < buf.length &&
          (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80 && (buf[i+3] & 0xC0) === 0x80) { i += 4; continue; }
      return false;
    }
    return true;
  })();
  if (isLikelyUtf8) return 'utf8';

  // Viele DACH-Exports: CP1252
  return 'win1252';
}

function decodeToUtf8(buf: Buffer): string {
  const enc = detectEncoding(buf);
  if (enc === 'utf8') {
    // BOM strip
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return buf.slice(3).toString('utf8');
    }
    return buf.toString('utf8');
  }
  if (enc === 'utf16le') return iconv.decode(buf, 'utf16-le');
  if (enc === 'utf16be') return iconv.decode(buf, 'utf16-be');
  // Fallback: Windows-1252
  return iconv.decode(buf, 'win1252');
}

function detectDelimiter(sample: string): ',' | ';' | '\t' {
  // Zähle Kandidaten in den ersten Zeilen
  const head = sample.split(/\r?\n/).slice(0, 5).join('\n');
  const c = (s: string, ch: string) => (s.match(new RegExp(`\\${ch}`, 'g')) || []).length;
  const commas = c(head, ',');
  const semis  = c(head, ';');
  const tabs   = c(head, '\t');
  if (semis >= commas && semis >= tabs) return ';';
  if (tabs  >= commas && tabs  >= semis) return '\t';
  return ',';
}

// Normalisierung der Spaltennamen
function normKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9 _-]/g,'')
    .replace(/\s+/g, '_');
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
      // Zellen wie "—" oder "-" als leer werten
      transform: (val) => {
        const s = String(val ?? '').trim();
        return s === '—' || s === '-' ? '' : val;
      }
    });

    if (parsed.errors?.length) {
      // Nimm die erste nützliche Fehlermeldung
      const first = parsed.errors[0];
      return NextResponse.json({ ok:false, error:`CSV-Fehler: ${first.message} (row ${first.row})` }, { status: 400 });
    }

    const rows = (parsed.data || []).map((r) => {
      // Versuche breite Spaltennamen zu unterstützen (deine Beispiel-CSV)
      const out = {
        ts: r.ts || r.datum || r.date || null,
        bewertung: toNumber(r.bewertung),
        beraterfreundlichkeit: toNumber(r.beraterfreundlichkeit) ?? toNumber(r.f) ?? toNumber(r.freundlichkeit),
        beraterqualifikation:  toNumber(r.beraterqualifikation)  ?? toNumber(r.q) ?? toNumber(r.qualifikation),
        angebotsattraktivitaet:toNumber(r.beratungsangebotsattraktivitaet) ?? toNumber(r.a) ?? toNumber(r.angebotsattraktivitaet),
        kommentar: r.kommentar ?? r.comment ?? r.kommentar_raw ?? r.kommentar_text ?? null,
        template_name: r.template_name ?? r['template name'] ?? r['vorlagenname'] ?? r.template ?? null,
        rekla: r.rekla ?? (r.reklamation ?? null),
        geklaert: r['anliegen_geklaert'] ?? r['anliegen geklaert?'] ?? r.geklaert ?? null,
        feedbacktyp: r.feedbacktyp ?? r.channel ?? r.kanal ?? null,
      };
      // Strings trimmen
      Object.keys(out).forEach((k) => {
        const v = (out as any)[k];
        if (typeof v === 'string') (out as any)[k] = v.trim();
      });
      return out;
    });

    return NextResponse.json({ ok:true, rows });
  } catch (e:any) {
    console.error('[feedback/parse]', e);
    return NextResponse.json({ ok:false, error:'Parsing fehlgeschlagen' }, { status: 500 });
  }
}
