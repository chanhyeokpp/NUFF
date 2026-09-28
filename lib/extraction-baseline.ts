import { instagramContent } from './instagram-preview';
import { extract, youtubeVideoId, type AIConfig } from './pipeline';

export type CorpusSource = 'web' | 'youtube' | 'instagram' | 'tiktok' | 'negative';
export type CorpusCase = 'public' | 'inaccessible' | 'malformed' | 'deceptive_host';
export type BaselineStatus = 'ready' | 'needs_content' | 'failed';

export type CorpusEntry = {
  id: string;
  source: CorpusSource;
  case: CorpusCase;
  url: string;
};

export type ExtractionCorpus = {
  schemaVersion: number;
  name: string;
  description: string;
  entries: CorpusEntry[];
};

type ExtractedSource = Awaited<ReturnType<typeof extract>>;
type ExtractFunction = (url: string, pasted?: string, config?: AIConfig) => Promise<ExtractedSource>;

export type BaselineResult = {
  id: string;
  source: CorpusSource;
  case: CorpusCase;
  url: string;
  status: BaselineStatus;
  extractionMode: string;
  durationMs: number;
  characterCount: number;
  hasDescription: boolean;
  hasThumbnail: boolean;
  errorCode?: string;
};

const minimumPublicCounts: Record<Exclude<CorpusSource, 'negative'>, number> = {
  web: 30,
  youtube: 20,
  instagram: 20,
  tiktok: 20,
};

function matchesDeclaredPublicSource(entry: CorpusEntry) {
  let url: URL;
  try {
    url = new URL(entry.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (entry.source === 'youtube') return Boolean(youtubeVideoId(entry.url));
  if (entry.source === 'instagram') return Boolean(instagramContent(entry.url));
  if (entry.source === 'tiktok') return host === 'tiktok.com' && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname);
  return entry.source === 'web' && !['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com'].includes(host);
}

export function validateCorpus(value: unknown): ExtractionCorpus {
  if (!value || typeof value !== 'object') throw new Error('corpus_not_object');
  const corpus = value as Partial<ExtractionCorpus>;
  if (corpus.schemaVersion !== 1 || typeof corpus.name !== 'string' || typeof corpus.description !== 'string' || !Array.isArray(corpus.entries)) {
    throw new Error('corpus_schema_invalid');
  }

  const ids = new Set<string>();
  const urls = new Set<string>();
  const counts = { web: 0, youtube: 0, instagram: 0, tiktok: 0 };
  const negativeCases = new Set<CorpusCase>();
  for (const entry of corpus.entries) {
    if (!entry || typeof entry !== 'object') throw new Error('corpus_entry_invalid');
    if (!/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id)) throw new Error(`corpus_id_invalid:${entry.id}`);
    if (!['web', 'youtube', 'instagram', 'tiktok', 'negative'].includes(entry.source)) throw new Error(`corpus_source_invalid:${entry.id}`);
    if (!['public', 'inaccessible', 'malformed', 'deceptive_host'].includes(entry.case)) throw new Error(`corpus_case_invalid:${entry.id}`);
    if (typeof entry.url !== 'string' || entry.url.length > 500 || urls.has(entry.url)) throw new Error(`corpus_url_invalid:${entry.id}`);
    if (entry.source !== 'negative' && (entry.case !== 'public' || !matchesDeclaredPublicSource(entry))) throw new Error(`corpus_public_source_invalid:${entry.id}`);
    ids.add(entry.id);
    urls.add(entry.url);
    if (entry.source === 'negative') negativeCases.add(entry.case);
    else if (entry.case === 'public') counts[entry.source] += 1;
  }

  for (const [source, minimum] of Object.entries(minimumPublicCounts)) {
    if (counts[source as keyof typeof counts] < minimum) throw new Error(`corpus_minimum_missing:${source}`);
  }
  for (const required of ['inaccessible', 'malformed', 'deceptive_host'] as const) {
    if (!negativeCases.has(required)) throw new Error(`corpus_negative_missing:${required}`);
  }
  return corpus as ExtractionCorpus;
}

export function extractionMode(url: string, config: AIConfig = {}) {
  try {
    if (youtubeVideoId(url)) return config.YOUTUBE_API_KEY ? 'youtube_official_metadata' : 'youtube_metadata_unconfigured';
  } catch {
    return 'validation';
  }
  if (instagramContent(url)) return 'instagram_public_preview';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok_public_preview';
    return 'direct_html';
  } catch {
    return 'validation';
  }
}

function normalizedErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/올바른 링크|http 또는 https|invalid url/i.test(message)) return 'invalid_url';
  if (/외부에 공개된/.test(message)) return 'non_public_host';
  if (/비공개 네트워크/.test(message)) return 'private_network';
  if (/주소 확인/.test(message)) return 'dns_validation_failed';
  if (/timeout|aborted/i.test(message) || (error instanceof Error && error.name === 'TimeoutError')) return 'timeout';
  return 'extraction_error';
}

export async function measureEntry(entry: CorpusEntry, config: AIConfig = {}, extractor: ExtractFunction = extract): Promise<BaselineResult> {
  const started = performance.now();
  const mode = extractionMode(entry.url, config);
  try {
    const result = await extractor(entry.url, undefined, config);
    return {
      ...entry,
      status: result.readable ? 'ready' : 'needs_content',
      extractionMode: mode,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      characterCount: result.text.length,
      hasDescription: Boolean(result.description),
      hasThumbnail: Boolean(result.thumbnail),
    };
  } catch (error) {
    return {
      ...entry,
      status: 'failed',
      extractionMode: mode,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      characterCount: 0,
      hasDescription: false,
      hasThumbnail: false,
      errorCode: normalizedErrorCode(error),
    };
  }
}

function percentile(values: number[], percentage: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((percentage / 100) * sorted.length) - 1];
}

export function summarizeBaseline(results: BaselineResult[]) {
  const sources = ['web', 'youtube', 'instagram', 'tiktok', 'negative'] as const;
  return Object.fromEntries(sources.map(source => {
    const matching = results.filter(result => result.source === source);
    return [source, {
      total: matching.length,
      ready: matching.filter(result => result.status === 'ready').length,
      needsContent: matching.filter(result => result.status === 'needs_content').length,
      failed: matching.filter(result => result.status === 'failed').length,
      p50DurationMs: percentile(matching.map(result => result.durationMs), 50),
      p95DurationMs: percentile(matching.map(result => result.durationMs), 95),
    }];
  }));
}
