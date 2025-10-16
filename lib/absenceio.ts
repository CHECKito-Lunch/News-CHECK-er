/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/absenceio.ts
import hawk from '@hapi/hawk';
import fetch from 'cross-fetch';

const BASE = process.env.ABSENCEIO_BASE ?? 'https://app.absence.io/api/v2';
const KEY_ID = process.env.ABSENCEIO_KEY_ID!;
const KEY_SECRET = process.env.ABSENCEIO_KEY_SECRET!;

function hawkHeader(url: string, method: string, payload?: string) {
  const { header } = hawk.client.header(url, method, {
    credentials: { id: KEY_ID, key: KEY_SECRET, algorithm: 'sha256' },
    payload,
    contentType: payload ? 'application/json' : undefined,
  });
  return header;
}

export async function absenceGet<T=any>(path: string, query?: Record<string, any>): Promise<T> {
  const qs = query
    ? '?' + new URLSearchParams(
        Object.entries(query).flatMap(([k,v]) => (v==null ? [] : [[k, String(v)]]))
      )
    : '';
  const url = BASE + path + qs;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: hawkHeader(url, 'GET'), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`absence.io ${res.status} ${await res.text().catch(()=>res.statusText)}`);
  return res.json();
}
