/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

// sehr einfacher CSV-Parser (UTF-8 erwartet). Für produktiv: PapaParse oder robustere Parser nutzen.
function parseCSV(text: string){
  const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const cols = head.split(';').map(s=>s.trim()); // Semikolon-getrennt (CHECK24-üblich). Bei Bedarf anpassen.
  const idx = (k:string) => cols.findIndex(c => c.toLowerCase() === k.toLowerCase());
  const has = (k:string) => idx(k) >= 0;
  return lines.map(l => {
    const parts = l.split(';');
    const val = (k:string) => { const i = idx(k); return i>=0 ? (parts[i]?.trim()||null) : null; };
    return {
      ts:               val('ts') || val('datum') || val('timestamp'),
      incident_type:    val('incident_type') || val('typ') || val('feedbacktyp'),
      category:         val('category') || val('kategorie'),
      severity:         val('severity') || val('gewichtung') || val('score'),
      description:      val('description') || val('kommentar') || val('beschreibung'),
      booking_number:   val('booking_number') || val('buchungsnummer') || val('bnr'),
      agent_first:      val('agent_first') || val('vorname'),
      agent_last:       val('agent_last') || val('nachname'),
      agent_name:       val('agent_name') || val('berater') || val('name'),
    };
  });
}

export async function POST(req: NextRequest){
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ ok:false, error:'no_file' }, { status: 400 });
  const text = await file.text();
  const rows = parseCSV(text);
  return NextResponse.json({ ok:true, rows });
}