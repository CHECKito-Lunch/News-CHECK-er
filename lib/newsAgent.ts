// lib/newsAgent.ts
import { supabaseAdmin } from './supabaseAdmin';

export type AgentConfig = {
  enabled: boolean;
  language: 'de'|'en'|'fr'|'it'|'es';
  countries: string[];
  terms: string[];
  times: string[];           // "HH:mm"
  maxArticles: number;
  autoPublish: boolean;
  defaultVendorId: number|null;
  defaultCategoryId: number|null;
  defaultBadgeIds: number[];
  model?: string;
  temperature?: number;
};

type NewsArticle = {
  title: string;
  description?: string|null;
  url: string;
  source?: { name?: string|null };
  publishedAt?: string;
  content?: string|null;
};

const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

function hasEnv(name: string) {
  return !!process.env[name] && String(process.env[name]).trim().length > 0;
}

async function loadConfig(): Promise<AgentConfig> {
  const { data, error } = await supabaseAdmin
    .from('app_settings').select('value')
    .eq('key','news_agent').single();
  if (error) throw error;
  return (data.value as AgentConfig);
}

export async function saveConfig(cfg: AgentConfig) {
  await supabaseAdmin.from('app_settings')
    .upsert({ key:'news_agent', value: cfg, updated_at: new Date().toISOString() })
    .eq('key','news_agent');
}

function buildQuery(terms: string[]) {
  return terms.map(t => `(${t.trim()})`).filter(Boolean).join(' OR ');
}

async function fetchNews(cfg: AgentConfig): Promise<NewsArticle[]> {
  if (!hasEnv('NEWS_API_KEY')) {
    // Kein Key: leere Liste (im Dry-Run ok, sonst Fehler höher)
    return [];
  }
  const apiKey = process.env.NEWS_API_KEY!;
  const q = buildQuery(cfg.terms || []);
  const params = new URLSearchParams({
    q: q || 'Reisewarnung OR Flughafen Streik',
    language: cfg.language || 'de',
    sortBy: 'publishedAt',
    pageSize: String(Math.min(100, Math.max(5, cfg.maxArticles || 30))),
  });
  const res = await fetch(`${NEWS_ENDPOINT}?${params.toString()}`, {
    headers: { 'X-Api-Key': apiKey },
    cache: 'no-store',
  });
  const json = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(json?.message || 'NewsAPI error');
  return (json.articles || []) as NewsArticle[];
}

async function summarizeWithOpenAI(cfg: AgentConfig, arts: NewsArticle[]) {
  if (!arts.length) return '';
  if (!hasEnv('OPENAI_API_KEY')) {
    // Fallback: einfache Stichpunkte ohne OpenAI
    return arts.slice(0, 10).map(a => `- ${a.title} — ${a.url}`).join('\n');
  }

  const model = cfg.model || 'gpt-4o-mini';
  const temperature = cfg.temperature ?? 0.2;

  const sys = `Du bist ein News-Analyst für Reise & Tourismus. Erstelle kurze Bulletpoints (Deutsch) mit Fokus auf Streiks, Sperrungen, IT-Ausfälle, Reisewarnungen.`;

  const list = arts.map(a => `- ${a.title} (${a.source?.name || ''}) – ${a.url}`).join('\n');

  const payload = {
    model,
    temperature,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Fasse kompakt zusammen:\n\n${list}` }
    ]
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions',{
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const j = await resp.json().catch(()=> ({}));
  if (!resp.ok) throw new Error(j?.error?.message || 'OpenAI error');
  const content = j.choices?.[0]?.message?.content?.trim() || '';
  return content;
}

function makeSlug(title: string) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function insertPostFromAgent(cfg: AgentConfig, summaryMd: string, sources: {url:string; label?:string|null}[], dryRun=false) {
  const status = cfg.autoPublish ? 'published' : 'draft';
  const title = 'Branchen-Update: Reise & Tourismus';
  const slugBase = makeSlug(`${title}-${new Date().toISOString().slice(0,10)}`);
  const slug = `${slugBase}`;

  if (dryRun) return { insertedId: null };

  const { data: post, error: e1 } = await supabaseAdmin
    .from('posts')
    .insert({
      title,
      slug,
      summary: 'Kurzüberblick der wichtigsten Meldungen.',
      content: summaryMd,
      status,
      effective_from: new Date().toISOString(),
      vendor_id: cfg.defaultVendorId,
      author_name: 'News-Agent',
    })
    .select('id')
    .single();
  if (e1) throw e1;

  if (cfg.defaultCategoryId) {
    await supabaseAdmin.from('post_categories').insert({ post_id: post.id, category_id: cfg.defaultCategoryId });
  }
  for (const b of (cfg.defaultBadgeIds || [])) {
    await supabaseAdmin.from('post_badges').insert({ post_id: post.id, badge_id: b });
  }
  for (let i=0;i<sources.length;i++){
    const s = sources[i];
    await supabaseAdmin.from('post_sources').insert({ post_id: post.id, url: s.url, label: s.label ?? null, sort_order: i });
  }

  return { insertedId: post.id };
}

function nowHHMM() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}
function isDue(now: string, times: string[], windowMin=10) {
  const toMin = (t:string)=>{ const [H,M]=t.split(':').map(n=>+n); return H*60+M; };
  const n = toMin(now);
  return (times||[]).some(t => Math.abs(toMin(t)-n) <= windowMin);
}

export async function runAgent({ force=false, dry=false } = {}) {
  const t0 = Date.now();
  const cfg = await loadConfig();
  if (!cfg.enabled && !force) {
    await logRun(Date.now()-t0, 0, 0, !!dry, 'disabled');
    return { skipped: 'disabled' };
  }

  // Simple lock (5 min)
  const lockName = 'news_agent';
  const { data: lock } = await supabaseAdmin.from('agent_locks').select('name, locked_at').eq('name', lockName).maybeSingle();
  if (lock && Date.now() - new Date(lock.locked_at).getTime() < 5*60*1000) {
    return { skipped: 'locked' };
  }
  await supabaseAdmin.from('agent_locks').upsert({ name: lockName, locked_at: new Date().toISOString() });

  try {
    if (!force) {
      const now = nowHHMM();
      if (!isDue(now, cfg.times || [], 10)) {
        return { skipped: `not due (${now})` };
      }
    }

    // -------- DRY-RUN: keine harten Fehler, best effort ----------
    if (dry) {
      let articles: NewsArticle[] = [];
      let usedNews = false;
      let usedOpenAI = false;
      let markdown = '';

      if (hasEnv('NEWS_API_KEY')) {
        try { articles = await fetchNews(cfg); usedNews = true; } catch { articles = []; }
      }
      if (articles.length && hasEnv('OPENAI_API_KEY')) {
        try { markdown = await summarizeWithOpenAI(cfg, articles.slice(0, cfg.maxArticles || 30)); usedOpenAI = true; } catch { markdown = ''; }
      }
      if (!markdown) {
        // Fallback-Preview
        markdown = (articles.slice(0, 10).map(a => `- ${a.title} — ${a.url}`)).join('\n') || '_Keine Inhalte im Dry-Run verfügbar._';
      }

      await logRun(Date.now()-t0, articles.length, 0, true, 'dry-run');
      return {
        mode: 'dry',
        usedNewsApi: usedNews,
        usedOpenAI,
        previewCount: articles.length,
        previewSources: articles.slice(0, 10).map(a => ({ url: a.url, source: a.source?.name || null })),
        previewMarkdown: markdown
      };
    }
    // -------- /DRY-RUN ----------

    // Normaler Lauf (mit echten Fehlern, wenn Keys fehlen)
    const articles = await fetchNews(cfg);
    const top = articles.slice(0, cfg.maxArticles || 30);
    const srcs = top.map(a => ({ url: a.url, label: a.source?.name || null }));
    const markdown = await summarizeWithOpenAI(cfg, top);

    const inserted = await insertPostFromAgent(cfg, markdown, srcs, false);
    const countInserted = inserted.insertedId ? 1 : 0;

    await logRun(Date.now()-t0, top.length, countInserted, false, inserted.insertedId ? `post#${inserted.insertedId}` : undefined);
    return { found: top.length, inserted: countInserted, id: inserted.insertedId || null };
  } finally {
    await supabaseAdmin.from('agent_locks').delete().eq('name', lockName);
  }
}

export async function logRun(tookMs: number, found: number, inserted: number, dryRun: boolean, note?: string) {
  await supabaseAdmin.from('agent_runs').insert({
    took_ms: Math.round(tookMs),
    found, inserted,
    dry_run: !!dryRun,
    note: note || null
  });
}

export async function getLogs(limit=20){
  const { data } = await supabaseAdmin
    .from('agent_runs')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getConfig() { return loadConfig(); }
export async function setConfig(cfg: AgentConfig) { return saveConfig(cfg); }
