import { NextRequest, NextResponse } from 'next/server';


export async function GET(_req: NextRequest){
const csv = [
'ts;incident_type;category;severity;description;booking_number;agent_first;agent_last;agent_name',
'14.10.2025 09:30;Fehler;Angebot;high;Falscher Preis ausgewiesen;1234567;Max;Muster;Max Muster',
].join('\n');
return new NextResponse(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="qa_template.csv"' } });
}