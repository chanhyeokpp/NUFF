import { instagramContent } from './instagram-preview';
import { youtubeVideoId } from './pipeline';
import type { BaselineResult, CorpusEntry, ExtractionCorpus } from './extraction-baseline';

export type ProviderRoute = 'instagram' | 'tiktok' | 'youtube' | 'web';

export type ProviderCandidate = {
  id: string;
  route: ProviderRoute;
  actorId: string;
  actorApiId: string;
  buildId: string;
  buildNumber: string;
  inputProfile: string;
  maintainedBy: string;
  permissionLevel: 'LIMITED_PERMISSIONS';
  modifiedAt: string;
  monthlyUsers: number;
  rating: number;
  thirtyDayRuns: { succeeded: number; total: number };
  pricing: { model: string; primaryEvent: string; freeTierUsdPerEvent: number | null; startUsd: number | null };
  maxChargeUsdPerRun: number;
  timeoutSecs: number;
  memoryMbytes: number;
  storeUrl: string;
};

export type CandidateManifest = {
  schemaVersion: number;
  observedAt: string;
  source: string;
  candidates: ProviderCandidate[];
};

export type EvaluationPlan = {
  id: string;
  caseIds: string[];
  inputUrls: string[];
  helperUrls: string[];
  input: Record<string, unknown>;
  maxItems: number;
};

export type SanitizedCaseResult = {
  caseId: string;
  status: 'metadata_success' | 'transcript_success' | 'content_success' | 'explicit_failure' | 'missing';
  durationMs: number;
  hasCaption: boolean;
  hasTranscript: boolean;
  hasTimestamps: boolean;
  errorCode?: string;
};

export type SanitizedPlanResult = {
  planId: string;
  status: string;
  durationMs: number;
  costUsd: number | null;
  outputCount: number;
  unmappedResultCount: number;
  ignoredHelperResultCount: number;
  duplicateResultCount: number;
  cases: SanitizedCaseResult[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringAt(object: Record<string, unknown>, ...paths: string[]) {
  for (const path of paths) {
    let value: unknown = object;
    for (const key of path.split('.')) value = asObject(value)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function arrayAt(object: Record<string, unknown>, ...paths: string[]) {
  for (const path of paths) {
    let value: unknown = object;
    for (const key of path.split('.')) value = asObject(value)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function platformId(route: ProviderRoute, value: string) {
  try {
    if (route === 'youtube') return youtubeVideoId(value);
    if (route === 'instagram') return instagramContent(value)?.url.match(/\/(?:p|reel|tv)\/([\w-]+)/)?.[1] || null;
    if (route === 'tiktok') return new URL(value).pathname.match(/\/video\/(\d+)/)?.[1] || null;
    if (route === 'web') {
      const url = new URL(value);
      url.hash = '';
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function itemPlatformId(route: ProviderRoute, item: Record<string, unknown>) {
  if (route === 'youtube') {
    const direct = stringAt(item, 'videoId', 'video_id');
    if (direct) return direct;
  }
  if (route === 'instagram') {
    const direct = stringAt(item, 'shortCode', 'shortcode', 'short_code', 'code');
    if (direct) return direct;
  }
  if (route === 'tiktok') {
    const direct = stringAt(item, 'id', 'videoId', 'videoMeta.id');
    if (/^\d+$/.test(direct)) return direct;
  }
  for (const path of ['inputUrl', 'input', 'url', 'webVideoUrl', 'postUrl', 'sourceUrl', 'canonicalUrl', 'metadata.url']) {
    const url = stringAt(item, path);
    const id = url && platformId(route, url);
    if (id) return id;
  }
  return null;
}

function explicitFailure(item: Record<string, unknown>) {
  const ok = item.ok;
  const status = stringAt(item, 'status', 'resultStatus').toLowerCase();
  const reason = stringAt(item, 'errorType', 'errorCode', 'skipReason', 'error', 'failureReason');
  if (ok === false || reason || ['failed', 'error', 'skipped', 'not_found', 'private', 'removed'].includes(status)) {
    const normalized = stringAt(item, 'errorType', 'errorCode', 'skipReason', 'status').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    return normalized.slice(0, 80) || 'provider_reported_failure';
  }
  return null;
}

function successfulItem(route: ProviderRoute, item: Record<string, unknown>) {
  if (route === 'youtube') {
    const segments = arrayAt(item, 'segments', 'transcript.segments');
    const transcript = stringAt(item, 'text', 'transcriptText', 'transcript.text');
    return {
      success: transcript.length > 0 || segments.length > 0,
      hasCaption: false,
      hasTranscript: transcript.length > 0 || segments.length > 0,
      hasTimestamps: segments.some(segment => typeof asObject(segment).start === 'number' || typeof asObject(segment).startSec === 'number'),
    };
  }
  if (route === 'web') {
    const content = stringAt(item, 'markdown', 'text', 'readableText', 'textContent', 'content');
    return { success: content.length >= 120, hasCaption: false, hasTranscript: false, hasTimestamps: false };
  }
  const caption = stringAt(item, 'caption', 'text', 'description', 'desc');
  const metadata = [
    stringAt(item, 'ownerUsername', 'owner.username', 'authorMeta.name', 'author.name'),
    stringAt(item, 'timestamp', 'createTimeISO', 'publishedAt'),
    stringAt(item, 'type', 'productType'),
    stringAt(item, 'title'),
  ].filter(Boolean);
  return { success: caption.length > 0 || metadata.length >= 1, hasCaption: caption.length > 0, hasTranscript: false, hasTimestamps: false };
}

function entriesForRoute(route: ProviderRoute, corpus: ExtractionCorpus, baseline: BaselineResult[], youtubeFallbackCaseIds: string[]) {
  if (route === 'web') {
    const ids = new Set(baseline.filter(result => result.source === 'web' && result.status !== 'ready').map(result => result.id));
    return corpus.entries.filter(entry => ids.has(entry.id) || entry.id === 'negative-inaccessible-web');
  }
  if (route === 'youtube') {
    const eligible = new Set(youtubeFallbackCaseIds);
    return corpus.entries.filter(entry => eligible.has(entry.id) && entry.source === 'youtube');
  }
  return corpus.entries.filter(entry => entry.source === route || entry.id === `negative-inaccessible-${route}`);
}

function plan(id: string, entries: CorpusEntry[], inputUrls: string[], input: Record<string, unknown>, helperUrls: string[] = []): EvaluationPlan {
  return { id, caseIds: entries.map(entry => entry.id), inputUrls, helperUrls, input, maxItems: Math.min(100, inputUrls.length + 5) };
}

export function buildEvaluationPlans(candidate: ProviderCandidate, corpus: ExtractionCorpus, baseline: BaselineResult[], youtubeFallbackCaseIds: string[] = []) {
  const entries = entriesForRoute(candidate.route, corpus, baseline, youtubeFallbackCaseIds);
  if (candidate.route === 'youtube' && !entries.length) return [];
  const urls = entries.map(entry => entry.url);
  const duplicate = urls[0];
  if (!duplicate) throw new Error(`no_evaluation_cases:${candidate.route}`);

  switch (candidate.inputProfile) {
    case 'instagram-apify-official-v1': {
      const posts = entries.filter(entry => !entry.url.includes('/reel/'));
      const reels = entries.filter(entry => entry.url.includes('/reel/'));
      return [
        plan(`${candidate.id}-posts`, posts, [...posts.map(entry => entry.url), posts[0].url], { resultsType: 'posts', directUrls: [...posts.map(entry => entry.url), posts[0].url], resultsLimit: 1, addParentData: false }),
        plan(`${candidate.id}-reels`, reels, [...reels.map(entry => entry.url), reels[0].url], { resultsType: 'reels', directUrls: [...reels.map(entry => entry.url), reels[0].url], resultsLimit: 1, addParentData: false }),
      ];
    }
    case 'instagram-apidojo-v1': {
      const chunks = [entries.slice(0, 10), entries.slice(10, 20), entries.slice(20)];
      return chunks.filter(chunk => chunk.length).map((chunk, index) => {
        const helpers = index === 2 ? entries.slice(0, Math.max(0, 10 - chunk.length)).map(entry => entry.url) : [];
        const inputUrls = [...chunk.map(entry => entry.url), ...helpers];
        return plan(`${candidate.id}-${index + 1}`, chunk, inputUrls, { startUrls: inputUrls, maxItems: 10, customMapFunction: '(object) => ({ ...object })' }, helpers);
      });
    }
    case 'tiktok-clockworks-v1': {
      const inputUrls = [...urls, duplicate];
      return [plan(candidate.id, entries, inputUrls, { postURLs: inputUrls, resultsPerPage: 1, scrapeRelatedVideos: false, scrapeAdditionalAuthorMeta: false, shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSlideshowImages: false, shouldDownloadAvatars: false, shouldDownloadMusicCovers: false, downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES', commentsPerPost: 0, proxyCountryCode: 'None' })];
    }
    case 'tiktok-get-leads-v1': {
      const inputUrls = [...urls, duplicate];
      return [plan(candidate.id, entries, inputUrls, { scrapeMode: 'tiktok-video-scraper', postURLs: inputUrls, useCache: false, includeTranscripts: false, proxyConfiguration: {} })];
    }
    case 'youtube-prodiger-captions-v1': {
      const inputUrls = [...urls, duplicate];
      return [plan(candidate.id, entries, inputUrls, { videoUrls: inputUrls, preferredLanguage: 'ko', transcriptMethod: 'captions', outputFormat: 'json', includeTimestamps: true, maxDurationMinutes: 300, maxVideosPerChannel: 1, maxWhisperMinutesPerRun: 0, proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] } })];
    }
    case 'youtube-insight-captions-v1': {
      const inputUrls = [...urls, duplicate];
      return [plan(candidate.id, entries, inputUrls, { videoUrls: inputUrls, languages: ['ko', 'en'], format: 'segments', includeTimestamps: true, includeMetadata: true, maxConcurrency: 4, videoTimeoutSecs: 30, maxRunSecs: 480, proxyConfiguration: { useApifyProxy: true }, residentialFallback: true })];
    }
    case 'web-apify-content-crawler-v1': {
      const inputUrls = [...urls, duplicate];
      return [plan(candidate.id, entries, inputUrls, { startUrls: inputUrls.map(url => ({ url })), crawlerType: 'playwright:adaptive', maxCrawlDepth: 0, maxCrawlPages: inputUrls.length, useSitemaps: false, useLlmsTxt: false, respectRobotsTxtFile: true, keepUrlFragments: false, proxyConfiguration: { useApifyProxy: true }, requestTimeoutSecs: 45, maxRequestRetries: 1, dynamicContentWaitSecs: 3, blockMedia: true, htmlTransformer: 'readableText', readableTextCharThreshold: 120 })];
    }
    default:
      throw new Error(`unknown_input_profile:${candidate.inputProfile}`);
  }
}

export function sanitizePlanResult(candidate: ProviderCandidate, planValue: EvaluationPlan, items: unknown[], durationMs: number, runStatus = 'SUCCEEDED', costUsd: number | null = null): SanitizedPlanResult {
  const expectedById = new Map<string, CorpusEntry>();
  for (const caseId of planValue.caseIds) {
    const index = planValue.caseIds.indexOf(caseId);
    const url = planValue.inputUrls[index];
    const id = platformId(candidate.route, url);
    if (id) expectedById.set(id, { id: caseId, source: candidate.route, case: caseId.includes('inaccessible') ? 'inaccessible' : 'public', url });
  }

  const mapped = new Map<string, Record<string, unknown>[] | undefined>();
  const helperIds = new Set(planValue.helperUrls.map(url => platformId(candidate.route, url)).filter((id): id is string => Boolean(id)));
  let unmappedResultCount = 0;
  let ignoredHelperResultCount = 0;
  for (const value of items) {
    const item = asObject(value);
    const id = itemPlatformId(candidate.route, item);
    if (id && helperIds.has(id)) {
      ignoredHelperResultCount += 1;
      continue;
    }
    if (!id || !expectedById.has(id)) {
      unmappedResultCount += 1;
      continue;
    }
    const values = mapped.get(id) || [];
    values.push(item);
    mapped.set(id, values);
  }

  const cases: SanitizedCaseResult[] = [];
  let duplicateResultCount = 0;
  for (const [id, entry] of expectedById) {
    const values = mapped.get(id) || [];
    duplicateResultCount += Math.max(0, values.length - 1);
    const item = values[0];
    if (!item) {
      cases.push({ caseId: entry.id, status: runStatus === 'SUCCEEDED' ? 'missing' : 'explicit_failure', durationMs, hasCaption: false, hasTranscript: false, hasTimestamps: false, ...(runStatus === 'SUCCEEDED' ? {} : { errorCode: 'provider_run_failed' }) });
      continue;
    }
    const failure = explicitFailure(item);
    if (failure) {
      cases.push({ caseId: entry.id, status: 'explicit_failure', durationMs, hasCaption: false, hasTranscript: false, hasTimestamps: false, errorCode: failure });
      continue;
    }
    const success = successfulItem(candidate.route, item);
    const status = success.success ? candidate.route === 'youtube' ? 'transcript_success' : candidate.route === 'web' ? 'content_success' : 'metadata_success' : 'missing';
    cases.push({ caseId: entry.id, status, durationMs, hasCaption: success.hasCaption, hasTranscript: success.hasTranscript, hasTimestamps: success.hasTimestamps });
  }

  return { planId: planValue.id, status: runStatus, durationMs, costUsd, outputCount: items.length, unmappedResultCount, ignoredHelperResultCount, duplicateResultCount, cases };
}

function percentile(values: number[], percentage: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((percentage / 100) * sorted.length) - 1];
}

export function summarizeProviderResults(results: SanitizedPlanResult[]) {
  const cases = results.flatMap(result => result.cases);
  const publicCases = cases.filter(result => !result.caseId.includes('inaccessible'));
  const successes = publicCases.filter(result => ['metadata_success', 'transcript_success', 'content_success'].includes(result.status));
  const explicit = cases.filter(result => result.status !== 'missing');
  const costs = results.map(result => result.costUsd);
  const knownCost = costs.every(cost => cost !== null) ? (costs as number[]).reduce((sum, cost) => sum + cost, 0) : null;
  return {
    totalCases: cases.length,
    publicCases: publicCases.length,
    successfulPublicCases: successes.length,
    metadataSuccessRate: publicCases.length ? successes.length / publicCases.length : 0,
    transcriptSuccessRate: publicCases.length ? publicCases.filter(result => result.hasTranscript).length / publicCases.length : null,
    timestampCoverageRate: publicCases.length ? publicCases.filter(result => result.hasTimestamps).length / publicCases.length : null,
    explicitResultOrReasonRate: cases.length ? explicit.length / cases.length : 0,
    p50DurationMs: percentile(cases.map(result => result.durationMs), 50),
    p95DurationMs: percentile(cases.map(result => result.durationMs), 95),
    duplicateResultCount: results.reduce((sum, result) => sum + result.duplicateResultCount, 0),
    unmappedResultCount: results.reduce((sum, result) => sum + result.unmappedResultCount, 0),
    costUsd: knownCost,
    costPerAttemptUsd: knownCost === null || !cases.length ? null : knownCost / cases.length,
    costPerSuccessfulItemUsd: knownCost === null || !successes.length ? null : knownCost / successes.length,
    gate: {
      metadataSuccess: publicCases.length > 0 && successes.length / publicCases.length >= 0.9,
      explicitCoverage: cases.length > 0 && explicit.length / cases.length >= 0.95,
      unambiguousMapping: results.every(result => result.unmappedResultCount === 0),
    },
  };
}

export function validateCandidateManifest(value: unknown): CandidateManifest {
  const manifest = asObject(value);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.candidates)) throw new Error('candidate_manifest_invalid');
  const ids = new Set<string>();
  for (const raw of manifest.candidates) {
    const candidate = asObject(raw) as ProviderCandidate;
    if (!candidate.id || ids.has(candidate.id) || !['instagram', 'tiktok', 'youtube', 'web'].includes(candidate.route)) throw new Error('candidate_invalid');
    if (candidate.permissionLevel !== 'LIMITED_PERMISSIONS' || !/^[\w.-]+~[\w.-]+$/.test(candidate.actorApiId) || !/^\d+\.\d+\.\d+$/.test(candidate.buildNumber)) throw new Error(`candidate_security_invalid:${candidate.id}`);
    if (!(candidate.maxChargeUsdPerRun > 0 && candidate.maxChargeUsdPerRun <= 0.5)) throw new Error(`candidate_cost_cap_invalid:${candidate.id}`);
    ids.add(candidate.id);
  }
  return value as CandidateManifest;
}
