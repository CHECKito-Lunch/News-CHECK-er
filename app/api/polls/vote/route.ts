// app/api/polls/vote/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const POLL_SALT     = process.env.POLL_SALT || 'changeme-poll-salt';

// Optional: Wenn du Service-Rollen-Zugriff willst (nicht nötig bei obigen Policies),
// kannst du stattdessen die SERVICE_ROLE nutzen. Mit obiger Insert-Policy reicht der Anon-Key.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });

function ipFrom(req: NextRequest) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  // Next.js local dev fallback:
  // @ts-ignore
  return (req as any).ip || '0.0.0.0';
}

function makeVoterHash(ip: string, userId?: string | null) {
  // Du kannst hier weitere Signale einmischen (User-Agent, Session-ID …),
  // wichtig: immer mit serverseitigem SALT hashen.
  return createHash('sha256')
    .update(`${ip}|${userId ?? ''}|${POLL_SALT}`)
    .digest('hex')
    .slice(0, 64);
}

export async function POST(req: NextRequest) {
  try {
    const { pollId, optionIndex, postId, postSlug, userId } = await req.json();

    if (!pollId || typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex > 255) {
      return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
    }

    const voterHash = makeVoterHash(ipFrom(req), userId ?? null);

    // 1) Stimme speichern (idempotent)
    const { data: voteRes, error: voteErr } = await supabase
      .rpc('poll_vote', {
        p_poll_id: pollId,
        p_option_index: optionIndex,
        p_voter_hash: voterHash,
        p_post_id: postId ?? null,
        p_post_slug: postSlug ?? null,
        p_user_id: userId ?? null,
      });

    if (voteErr) {
      // z. B. Policy/Typfehler
      return NextResponse.json({ error: voteErr.message }, { status: 400 });
    }

    // 2) Aggregierte Counts zurückgeben
    const { data: counts, error: countsErr } = await supabase
      .rpc('poll_counts', { p_poll_id: pollId });

    if (countsErr) {
      return NextResponse.json({ error: countsErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      alreadyVoted: Array.isArray(voteRes) ? voteRes[0]?.already_voted === true : !!voteRes?.already_voted,
      counts, // [{ option_index: number, votes: number }]
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Internal Error' }, { status: 500 });
  }
}
