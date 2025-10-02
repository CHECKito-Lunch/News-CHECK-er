export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  // Semikolon-getrennt (de-DE kompatibel)
  const csv =
`Bewertung;Beraterfreundlichkeit;Beraterqualifikation;Beratungsangebotsattraktivität;Kommentar;Template Name;Rekla;Anliegen geklärt?;Feedbacktyp;Datum
5;5;5;5;Sehr gut.;02. KD GS Hinterlegung Bestätigung;nein;ja;service_phone;2025-09-08`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="feedback_template.csv"',
    },
  });
}
