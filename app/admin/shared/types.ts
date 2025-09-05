// app/admin/_shared/types.ts
export type Role = 'admin' | 'moderator' | 'user';

export type Option = { id: number; name: string; color?: string | null; kind?: string | null };

export type SourceRow = { url: string; label: string };

export type Revision = {
  id: number;
  action: 'create' | 'update' | 'delete';
  changed_at: string;
  editor_name: string | null;
  changes: {
    fields?: { key: string; from: unknown; to: unknown }[];
    categories?: { added: number[]; removed: number[] };
    badges?: { added: number[]; removed: number[] };
    sources?: { added: string[]; removed: string[] };
  } | null;
};

export type PostRow = {
  id: number;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string | null;
  status: 'draft' | 'scheduled' | 'published';
  pinned_until: string | null;
  effective_from: string | null;
  vendor_id: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  author_name?: string | null;
  categories: { id: number; name: string; color: string | null }[];
  badges: { id: number; name: string; color: string | null; kind: string | null }[];
  sources?: { url: string; label: string | null; sort_order?: number }[];
};

export type AgentConfig = {
  enabled: boolean;
  language: 'de'|'en'|'fr'|'it'|'es';
  countries: string[];
  terms: string[];
  times: string[];
  maxArticles: number;
  autoPublish: boolean;
  defaultVendorId: number|null;
  defaultCategoryId: number|null;
  defaultBadgeIds: number[];
  model?: string;
  temperature?: number;
};

export type AgentLog = {
  id: string;
  ranAt: string;
  tookMs: number;
  found: number;
  inserted: number;
  dryRun: boolean;
  note?: string;
};
