// app/api/admin/feedback/template/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  // ⚠️ Wichtig: UTF-8 BOM für Excel, Semikolon als Trenner, Header-Namen exakt wie im Import
  const header = [
    'Erhalten',                       // Datum/Zeit der Rückmeldung
    'Buchungsnummer',                 // wird bereinigt + gehasht/verschlüsselt
    'Beratervorname',
    'Beraternachname',
    'Bearbeiter',                     // hat Vorrang, wenn befüllt (voller Name)
    'Bewertung',
    'Beraterfreundlichkeit',
    'Beraterqualifikation',
    'Beratungsangebotsattraktivität',
    'Kommentar',
    'Template Name',
    'Rekla',
    'Anliegen geklärt?',
    'Feedbacktyp'
  ].join(';');

  // Beispielzeile – gerne anpassen/duplizieren
  const example = [
    '2025-09-08 14:35',               // Erhalten (ISO, dd.mm.yyyy oder dd/mm/yyyy geht auch)
    '5546684681',                     // Buchungsnummer (nur Ziffern werden übernommen)
    'Max',                            // Beratervorname
    'Mustermann',                     // Beraternachname
    'Max Mustermann',                 // Bearbeiter (voller Name; überschreibt Vor-/Nachname)
    '5',                              // Bewertung (1..5)
    '5',                              // Beraterfreundlichkeit (1..5)
    '5',                              // Beraterqualifikation (1..5)
    '5',                              // Beratungsangebotsattraktivität (1..5)
    'Sehr gut.',                      // Kommentar
    '02. KD GS Hinterlegung Bestätigung', // Template Name
    'nein',                           // Rekla (ja/nein)
    'ja',                             // Anliegen geklärt? (ja/nein)
    'service_phone'                   // Feedbacktyp
  ].join(';');

  const csv = `${header}\n${example}\n`;

  // BOM + CSV
  const body = '\uFEFF' + csv;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="feedback_template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
