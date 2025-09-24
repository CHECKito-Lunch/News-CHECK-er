// lib/server/polls.ts
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabase-server';

export type PollRow = {
  id: string;
  question: string;
  options: string[];
  multi_choice: boolean;
  max_choices: number;
  allow_change: boolean;
  closed_at: string | null;
};

export type CountRow = { option_index: number; votes: number };

export type VoteRow = {
  id: string;
  poll_id: string;
  option_index: number;
  voter_hash: string;
  post_id: number | null;
  post_slug: string | null;
  user_id: string | null;
  created_at?: string | null;   // optional: nur fürs Auslesen
  updated_at?: string | null;   // optional: nur fürs Auslesen
};

export async function getSupabaseServer() {
  return supabaseServer();
}

/** Stabiler Hash pro Gerät/Nutzer-Kontext (einfacher Ansatz, anti-spam light) */
export async function voterHashFromRequest(req: NextRequest, pollId: string) {
  const ip =
    req.headers.get('x-forwarded-for') ||
    req.headers.get('cf-connecting-ip') ||
    '0.0.0.0';
  const ua = req.headers.get('user-agent') || '';
  const jar = await cookies();
  const rid = jar.get('rid')?.value || ''; // optional: eigenes Request-ID-Cookie
  const salt = process.env.POLL_SALT || 'change-me';
  return crypto
    .createHash('sha256')
    .update(`${pollId}|${ip}|${ua}|${rid}|${salt}`)
    .digest('hex');
}

/* =========================
 * Admin/Public: Reads
 * =======================*/

export async function listPolls(): Promise<PollRow[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from('polls')
    .select('id,question,options,multi_choice,max_choices,allow_change,closed_at') // keine created/updated selektieren
    .order('id', { ascending: false }); // oder nach custom Feld
  if (error) throw error;
  return (data || []).map((x: any) => ({ ...x, options: x.options ?? [] }));
}

export async function getPoll(id: string): Promise<PollRow | null> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from('polls')
    .select('id,question,options,multi_choice,max_choices,allow_change,closed_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? ({ ...data, options: (data as any).options ?? [] } as PollRow) : null;
}

export async function getCounts(pollId: string): Promise<CountRow[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('poll_counts', { p_poll_id: pollId });
  if (error) throw error;
  return (data || []) as CountRow[];
}

export async function listVotes(
  pollId: string,
  limit = 100,
  offset = 0
): Promise<VoteRow[]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb
    .from('poll_votes')
    .select(
      'id,poll_id,option_index,voter_hash,post_id,post_slug,user_id,created_at,updated_at'
    )
    .eq('poll_id', pollId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data || []) as VoteRow[];
}

/* =========================
 * Admin: Writes
 * =======================*/

export async function upsertPoll(p: PollRow): Promise<PollRow> {
  const sb = await getSupabaseServer();

  // Nur erlaubte Felder + Defaults
  const row = {
    id: p.id,
    question: String(p.question ?? '').trim(),
    options: Array.isArray(p.options) ? p.options : [],
    multi_choice: !!p.multi_choice,
    max_choices:
      Number.isFinite(p.max_choices) && p.max_choices > 0 ? p.max_choices : 1,
    allow_change: !!p.allow_change,
    closed_at: p.closed_at ?? null,
  };

  const { data, error } = await sb
    .from('polls')
    .upsert(row, { onConflict: 'id' })
    .select('id,question,options,multi_choice,max_choices,allow_change,closed_at')
    .single();

  if (error) throw error;
  return { ...(data as any), options: (data as any).options ?? [] } as PollRow;
}

export async function patchPoll(
  id: string,
  patch: Partial<PollRow>
): Promise<PollRow> {
  const sb = await getSupabaseServer();

  // Patch sanitizen (nur bekannte Felder zulassen)
  const upd: Partial<PollRow> = {};
  if (typeof patch.question === 'string') upd.question = patch.question;
  if (Array.isArray(patch.options)) upd.options = patch.options;
  if (typeof patch.multi_choice === 'boolean')
    upd.multi_choice = patch.multi_choice;
  if (typeof patch.max_choices === 'number')
    upd.max_choices = patch.max_choices > 0 ? patch.max_choices : 1;
  if (typeof patch.allow_change === 'boolean')
    upd.allow_change = patch.allow_change;
  if (patch.closed_at === null || typeof patch.closed_at === 'string')
    upd.closed_at = patch.closed_at;

  const { data, error } = await sb
    .from('polls')
    .update(upd)
    .eq('id', id)
    .select('id,question,options,multi_choice,max_choices,allow_change,closed_at')
    .single();

  if (error) throw error;
  return { ...(data as any), options: (data as any).options ?? [] } as PollRow;
}

export async function deletePoll(id: string) {
  const sb = await getSupabaseServer();
  // Falls kein FK ON DELETE CASCADE existiert, Votes zuerst entfernen:
  await sb.from('poll_votes').delete().eq('poll_id', id);
  const { error } = await sb.from('polls').delete().eq('id', id);
  if (error) throw error;
}

export async function setClosedAt(
  id: string,
  closedAt: string | null
): Promise<PollRow> {
  return patchPoll(id, { closed_at: closedAt } as Partial<PollRow>);
}

/* =========================
 * Public: Meta & Voting
 * =======================*/

export async function upsertMeta(
  pollId: string,
  question?: string,
  options?: string[]
) {
  if (!question || !Array.isArray(options)) return;
  const sb = await getSupabaseServer();
  await sb.rpc('poll_upsert_metadata', {
    p_poll_id: pollId,
    p_question: String(question),
    p_options: options as any,
  });
}

export async function voteSingle(args: {
  pollId: string;
  optionIndex: number;
  voterHash: string;
  postId?: number;
  postSlug?: string;
}) {
  const sb = await getSupabaseServer();
  const { error } = await sb.rpc('poll_vote_single', {
    p_poll_id: args.pollId,
    p_option_index: args.optionIndex,
    p_voter_hash: args.voterHash,
    p_post_id: args.postId ?? null,
    p_post_slug: args.postSlug ?? null,
    p_user_id: null,
  });
  if (error) throw error;
}

export async function voteMulti(args: {
  pollId: string;
  optionIndices: number[];
  voterHash: string;
  postId?: number;
  postSlug?: string;
}) {
  const sb = await getSupabaseServer();
  const { error } = await sb.rpc('poll_vote_multi', {
    p_poll_id: args.pollId,
    p_option_indices: args.optionIndices,
    p_voter_hash: args.voterHash,
    p_post_id: args.postId ?? null,
    p_post_slug: args.postSlug ?? null,
    p_user_id: null,
  });
  if (error) throw error;
}
