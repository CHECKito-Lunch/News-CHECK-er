// lib/newsAgent.ts
import { supabaseAdmin } from './supabaseAdmin';

const AGENT_BADGE_NAME = '⚡ Agent';
const AGENT_BADGE_COLOR = '#f59e0b'; // amber
const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

async function ensureAgentBadgeId(): Promise<number> {
  const db = supabaseAdmin();
  const { data: found, error: e1 } = await db
    .from('badges')
    .select('id')
    .eq('name', AGENT_BADGE_NAME)
    .maybeSingle();
  if (e1) throw e1;
  if (found?.id) return found.id;

  const { data: created, error: e2 } = await db
    .from('badges')
    .insert({ name: AGENT_BADGE_NAME, color: AGENT_BADGE_COLOR, kind: 'info' })
    .select('id')
    .single();
  if (e2) throw e2;
  return created!.id;
}

export type AgentConfig = {
  enabled: boolean;
  language: 'de'|'en'|'fr'|'it'|'es';
  countries: string[];
  terms: string[];
  times: string[];           // "HH:mm" in lokaler TZ
  maxArticles: number;
  autoPublish: boolean;
  defaultVendorId: number|null;
  defaultCategoryId: number|null;
  defaultBadgeIds: number[];
  model?: string;
  temperature?: number;
  timezone?: string;         // z. B. "Europe/Berlin"
};

type NewsArticle = {
  title: string;
  description?: string|null;
  url: string;
  source?: { name?: string|null };
  publishedAt?: string;
  content?: string|null;
};

// ---------- Helpers ----------
function hasEnv(name: string) {
  return !!process.env[name] && String(process.env[name]).trim().length > 0;
}

/** Terms sanitisieren (Trim, Duplikate, max Länge, max Anzahl) */
function sanitizeTerms(raw: string[], maxTerms = 100, maxLen = 120) {
  return Array.from(new Set(
    (raw || [])
      .map(s => s.trim())
      .filter(s => s && s.length <= maxLen)
  )).slice(0, maxTerms);
}

/** macht aus ["a","b","c"] => ["(a) OR (b)", "(c)"]  mit Char-Limit */
function chunkQueries(terms: string[], maxQChars = 450): string[] {
  const cleaned = sanitizeTerms(terms);
  const chunks: string[] = [];
  let cur = '';

  for (const t of cleaned) {
    const wrapped = `(${t})`;
    if (!cur) { cur = wrapped; continue; }
    // + 4 wegen " OR "
    if ((cur.length + 4 + wrapped.length) <= maxQChars) {
      cur += ` OR ${wrapped}`;
    } else {
      chunks.push(cur);
      cur = wrapped;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : ['(Reisewarnung)']; // Fallback
}

/** dedupliziert News anhand URL */
function mergeDedup(arts: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of arts) {
    const key = (a.url || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Domain/Label für Quellenzeile */
function sourceLabelOf(url?: string | null, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback.trim();
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.replace(/^www\./, '');
    return host || (fallback || '').trim() || 'Quelle';
  } catch {
    return (fallback || 'Quelle').trim();
  }
}

/** Markdown-Liste „### Quellen“ passend zu Artikeln (1-based Nummerierung) */
function buildRefsMarkdown(arts: NewsArticle[]) {
  const lines = arts.map((a, i) => {
    const label = sourceLabelOf(a.url, a.source?.name || null);
    const url = a.url || '';
    return `${i + 1}. ${label} — ${url}`;
  });
  return lines.join('\n');
}

/** sichere TZ (fällt auf Europe/Berlin zurück) */
function safeTimeZone(tz?: string | null): string {
  const candidate = (tz || '').trim();
  if (!candidate) return 'Europe/Berlin';
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: candidate });
    return candidate;
  } catch {
    return 'Europe/Berlin';
  }
}

function nowHHMMInTZ(tz?: string) {
  const timeZone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

function isDue(now: string, times: string[], windowMin=10) {
  const toMin = (t:string)=>{ const [H,M]=t.split(':').map(n=>+n); return H*60+M; };
  const n = toMin(now);
  if (!Number.isFinite(n)) return false;
  return (times||[]).some(t => {
    const tm = toMin(t);
    return Number.isFinite(tm) && Math.abs(tm - n) <= windowMin;
  });
}

// ---------- Config ----------
async function loadConfig(): Promise<AgentConfig> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'news_agent')
    .single();
  if (error) throw error;
  const cfg = (data?.value ?? null) as AgentConfig | null;
  if (!cfg) throw new Error('news_agent config missing');
  // direkt sanitisieren
  cfg.terms = sanitizeTerms(cfg.terms);
  return cfg;
}

export async function saveConfig(cfg: AgentConfig) {
  // Sanitize bevor speichern
  const clean: AgentConfig = {
    ...cfg,
    terms: sanitizeTerms(cfg.terms),
  };
  const db = supabaseAdmin();
  await db
    .from('app_settings')
    .upsert({ key: 'news_agent', value: clean, updated_at: new Date().toISOString() })
    .eq('key', 'news_agent');
}

// ---------- NewsAPI ----------
async function fetchNews(cfg: AgentConfig): Promise<NewsArticle[]> {
  if (!hasEnv('NEWS_API_KEY')) return [];
  const apiKey = process.env.NEWS_API_KEY!;
  const batches = chunkQueries(cfg.terms || [], 450);

  const targetLimit = Math.max(1, cfg.maxArticles || 30);
  const perBatch = Math.min(100, Math.max(5, targetLimit));
  const lang = cfg.language || 'de';

  const all: NewsArticle[] = [];

  for (const q of batches) {
    const params = new URLSearchParams({
      q,
      language: lang,
      sortBy: 'publishedAt',
      pageSize: String(perBatch),
    });
    const res = await fetch(`${NEWS_ENDPOINT}?${params.toString()}`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    let json: any = {};
    try { json = await res.json(); } catch {}
    if (!res.ok) {
      // Optional: internes Logging – hier still weiter
      continue;
    }

    const arr = Array.isArray(json.articles) ? (json.articles as NewsArticle[]) : [];
    all.push(...arr);

    if (all.length >= targetLimit) break; // früh abbrechen
  }

  const deduped = mergeDedup(all);
  return deduped.slice(0, targetLimit);
}

// ---------- OpenAI (Bullets mit [n]-Markern) ----------
async function summarizeWithOpenAI(cfg: AgentConfig, arts: NewsArticle[]) {
  if (!arts.length) return '';

  // Fallback ohne OpenAI: Bullets mit 1:1 Marker, Quellenliste wird später angehängt
  if (!hasEnv('OPENAI_API_KEY')) {
    const bullets = arts.slice(0, 10).map((a, i) => `- ${a.title} [${i + 1}]`).join('\n');
    return bullets;
  }

  const model = cfg.model || 'gpt-4o-mini';
  const temperature = cfg.temperature ?? 0.2;

  // Referenzliste vorbereiten (1-based)
  const refs = arts.map((a, i) => {
    const label = sourceLabelOf(a.url, a.source?.name || null);
    const url = a.url || '';
    return `[${i + 1}] ${label} — ${url}`;
  }).join('\n');

  const sys =
`Du bist News-Analyst:in für Reise & Tourismus.
Schreibe prägnante Bulletpoints (Deutsch) zu Auswirkungen für Reisende/Branche
(z. B. Streiks, Sperrungen, IT-Ausfälle, Sicherheitswarnungen, Reisewarnungen, Insolvenzen etc.).
WICHTIG: Zitiere am Ende jedes Bullets die passenden Quellen-Nummern in eckigen Klammern, z. B. [1] oder [2, 5].
Verwende ausschließlich Nummern aus der bereitgestellten Quellenliste. Keine eigene „Quellen“-Sektion ausgeben.`;

  const listForModel = arts.map((a, i) => `- (${i + 1}) ${a.title} — ${a.url}`).join('\n');

  const user =
`Material (max. ${Math.min(arts.length, 30)} Artikel):
${listForModel}

Quellen (Nummern bitte für die Zitate verwenden):
${refs}

Aufgabe:
Erstelle 6–10 kurze, sachliche Bulletpoints. 
Am Ende jedes Bullets setze die passenden Quellen-Nummern in eckigen Klammern. 
Keine Einleitung, kein Fazit, KEINE eigene Quellenliste. Nur die Bullets.`;

  const payload = {
    model,
    temperature,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
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

// ---------- Insert Post ----------
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

/** NEU: Slug mit Sekunden-Zeitstempel, z. B. 2025-09-05-15-32-07 */
function makeSlugWithTime(title: string) {
  const now = new Date();
  // ISO -> 2025-09-05T15:32:07.123Z  →  2025-09-05-15-32-07
  const stamp = now.toISOString().replace(/[:T]/g, '-').replace(/\.\d+Z$/, '').slice(0, 19);
  return makeSlug(`${title}-${stamp}`);
}

async function insertPostFromAgent(
  cfg: AgentConfig,
  summaryMd: string,
  sources: {url:string; label?:string|null}[],
  dryRun = false
) {
  const db = supabaseAdmin();
  const status = cfg.autoPublish ? 'published' : 'draft';
  const title = 'Branchen-Update: Reise & Tourismus';
  const baseSlug = makeSlugWithTime(title); // ← eindeutiger Basis-Slug
  let slug = baseSlug;

  if (dryRun) return { insertedId: null };

  // ⚡ Agent-Badge sicherstellen und zusammenführen
  const agentBadgeId = await ensureAgentBadgeId();
  const mergedBadgeIds = Array.from(new Set([...(cfg.defaultBadgeIds || []), agentBadgeId]));

  // kleine Retry-Schleife für theoretische Kollisionen
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: post, error: e1 } = await db
      .from('posts')
      .insert({
        title,
        slug,
        summary: 'Kurzüberblick der wichtigsten Meldungen.',
        content: summaryMd,
        status,
        effective_from: new Date().toISOString(),
        vendor_id: cfg.defaultVendorId ?? null,
      })
      .select('id')
      .single();

    if (!e1 && post?.id) {
      // Beziehungen
      if (cfg.defaultCategoryId) {
        await db.from('post_categories').insert({ post_id: post.id, category_id: cfg.defaultCategoryId });
      }
      for (const b of mergedBadgeIds) {
        await db.from('post_badges').insert({ post_id: post.id, badge_id: b });
      }
      for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        await db.from('post_sources').insert({ post_id: post.id, url: s.url, label: s.label ?? null, sort_order: i });
      }
      return { insertedId: post.id };
    }

    // 23505 = Unique violation → neuen Slug probieren
    const code = (e1 as any)?.code ?? (e1 as any)?.details?.code;
    if (code === '23505') {
      slug = `${baseSlug}-${attempt + 2}`; // -2, -3, ...
      continue;
    }

    // anderer Fehler
    if (e1) throw e1;
  }

  throw new Error('Konnte keinen eindeutigen Slug finden (zu viele Kollisionen).');
}

// ---------- Orchestrierung ----------
export async function runAgent({ force=false, dry=false } = {}) {
  const t0 = Date.now();
  const cfg = await loadConfig();

  if (!cfg.enabled && !force) {
    await logRun(Date.now()-t0, 0, 0, !!dry, 'disabled');
    return { skipped: 'disabled' };
  }

  const db = supabaseAdmin();

  // Simple lock (5 min)
  const lockName = 'news_agent';
  const { data: lock } = await db
    .from('agent_locks')
    .select('name, locked_at')
    .eq('name', lockName)
    .maybeSingle();
  if (lock && Date.now() - new Date(lock.locked_at).getTime() < 5*60*1000) {
    return { skipped: 'locked' };
  }
  await db.from('agent_locks').upsert({ name: lockName, locked_at: new Date().toISOString() });

  try {
    if (!force) {
      const nowLocal = nowHHMMInTZ(cfg.timezone);
      if (!isDue(nowLocal, cfg.times || [], 10)) {
        return { skipped: `not due (${nowLocal} ${safeTimeZone(cfg.timezone)})` };
      }
    }

    // -------- DRY-RUN ----------
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
        // Fallback: einfache Liste (ohne OpenAI) mit Marker
        markdown = (articles.slice(0, 10).map((a, i) => `- ${a.title} [${i + 1}]`)).join('\n') || '_Keine Inhalte im Dry-Run verfügbar._';
      }

      // Quellenliste anhängen – garantiert konsistent mit den Markern
      const refsMd = buildRefsMarkdown(articles.slice(0, cfg.maxArticles || 30));
      const preview = `${markdown}\n\n### Quellen\n${refsMd}`;

      await logRun(Date.now()-t0, articles.length, 0, true, 'dry-run');
      return {
        mode: 'dry',
        usedNewsApi: usedNews,
        usedOpenAI,
        previewCount: articles.length,
        previewSources: articles.slice(0, 10).map(a => ({ url: a.url, source: a.source?.name || null })),
        previewMarkdown: preview
      };
    }
    // -------- /DRY-RUN ----------

    // Normaler Lauf
    const articles = await fetchNews(cfg);
    const top = articles.slice(0, cfg.maxArticles || 30);

    // Label hier identisch zu buildRefsMarkdown => 100% Konsistenz
    const srcs = top.map(a => ({
      url: a.url,
      label: sourceLabelOf(a.url, a.source?.name || null)
    }));

    // Bullets mit [n]-Markern + konsistente Quellenliste
    const bullets = await summarizeWithOpenAI(cfg, top);
    const refsMd = buildRefsMarkdown(top);
    const contentMd = `${bullets}\n\n### Quellen\n${refsMd}`;

    const inserted = await insertPostFromAgent(cfg, contentMd, srcs, false);
    const countInserted = inserted.insertedId ? 1 : 0;

    await logRun(Date.now()-t0, top.length, countInserted, false, inserted.insertedId ? `post#${inserted.insertedId}` : undefined);
    return { found: top.length, inserted: countInserted, id: inserted.insertedId || null };
  } finally {
    await db.from('agent_locks').delete().eq('name', lockName);
  }
}

// ---------- Logging ----------
export async function logRun(tookMs: number, found: number, inserted: number, dryRun: boolean, note?: string) {
  const db = supabaseAdmin();
  await db.from('agent_runs').insert({
    ran_at: new Date().toISOString(),   // <-- sorgt für gültiges Datum
    took_ms: Math.round(tookMs),
    found,
    inserted,
    dry_run: !!dryRun,
    note: note || null,
  });
}

// ---------- API-Wrapper ----------
export async function getLogs(limit = 20){
  const db = supabaseAdmin();
  const { data } = await db
    .from('agent_runs')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getConfig() { return loadConfig(); }
export async function setConfig(cfg: AgentConfig) { return saveConfig(cfg); }
