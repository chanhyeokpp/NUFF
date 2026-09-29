import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { buildEvaluationPlans, sanitizePlanResult, summarizeProviderResults, validateCandidateManifest, type ProviderCandidate, type SanitizedPlanResult } from '../lib/provider-evaluation';
import { validateCorpus, type BaselineResult } from '../lib/extraction-baseline';

type ActorRun = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  defaultDatasetId?: string;
  defaultKeyValueStoreId?: string;
  defaultRequestQueueId?: string;
  usageTotalUsd?: number;
  usageUsd?: number;
};

function argument(name: string, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function safeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('pass_date_must_be_yyyy_mm_dd');
  return value;
}

const terminalStatuses = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
const token = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || '';
const passDate = safeDate(argument('pass-date', new Date().toISOString().slice(0, 10)));
const selectedId = argument('candidate');
const approval = Number.parseFloat(argument('max-approved-usd', '0'));
const confirmed = argument('confirm-paid-run') === 'YES';

const manifest = validateCandidateManifest(JSON.parse(await readFile('benchmarks/providers/candidates.v1.json', 'utf8')));
const corpus = validateCorpus(JSON.parse(await readFile('benchmarks/extraction/corpus.v1.json', 'utf8')));
const baseline = JSON.parse(await readFile('benchmarks/extraction/baseline.current.json', 'utf8')) as { results: BaselineResult[] };
const youtubeFallback = JSON.parse(await readFile('benchmarks/providers/youtube-fallback-cases.v1.json', 'utf8')) as { caseIds?: unknown };
const youtubeFallbackCaseIds = Array.isArray(youtubeFallback.caseIds) && youtubeFallback.caseIds.every(value => typeof value === 'string') ? youtubeFallback.caseIds : [];
const candidates = selectedId === 'all' ? manifest.candidates : manifest.candidates.filter(candidate => candidate.id === selectedId);
if (!candidates.length) throw new Error('candidate_required_or_unknown');

const planned = candidates.map(candidate => ({ candidate, plans: buildEvaluationPlans(candidate, corpus, baseline.results, youtubeFallbackCaseIds) }));
const blocked = planned.filter(value => value.plans.length === 0);
const runnable = planned.filter(value => value.plans.length > 0);
if (blocked.length) process.stdout.write(`Blocked pending observed Gemini video_unavailable cases: ${blocked.map(value => value.candidate.id).join(', ')}\n`);
if (!runnable.length) {
  process.stdout.write('No Actor was started. Record eligible case IDs before evaluating a YouTube fallback candidate.\n');
  process.exit(3);
}
const maximumExposure = runnable.reduce((sum, value) => sum + value.candidate.maxChargeUsdPerRun * value.plans.length, 0);
process.stdout.write(`Candidates: ${candidates.map(candidate => candidate.id).join(', ')}\n`);
process.stdout.write(`Maximum configured exposure: $${maximumExposure.toFixed(2)}\n`);
if (!confirmed || !token || !Number.isFinite(approval) || approval < maximumExposure) {
  process.stdout.write('Dry gate only: no Actor was started. Provide APIFY_API_TOKEN, --confirm-paid-run=YES, and --max-approved-usd at or above the displayed exposure.\n');
  process.exit(2);
}

async function apify(pathname: string, init?: RequestInit) {
  const response = await fetch(`https://api.apify.com/v2/${pathname}`, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    signal: AbortSignal.timeout(65000),
  });
  if (!response.ok) throw new Error(`apify_http_${response.status}`);
  return response.json() as Promise<{ data?: ActorRun } | unknown[]>;
}

async function deleteStorage(kind: 'datasets' | 'key-value-stores' | 'request-queues', id?: string) {
  if (!id) return;
  const response = await fetch(`https://api.apify.com/v2/${kind}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok && response.status !== 404) process.stderr.write(`Cleanup warning: ${kind} returned ${response.status}\n`);
}

async function executePlan(candidate: ProviderCandidate, plan: ReturnType<typeof buildEvaluationPlans>[number]) {
  const query = new URLSearchParams({
    build: candidate.buildNumber,
    timeout: String(candidate.timeoutSecs),
    memory: String(candidate.memoryMbytes),
    maxItems: String(plan.maxItems),
    maxTotalChargeUsd: String(candidate.maxChargeUsdPerRun),
    waitForFinish: '60',
  });
  const started = await apify(`acts/${candidate.actorApiId}/runs?${query}`, { method: 'POST', body: JSON.stringify(plan.input) }) as { data?: ActorRun };
  if (!started.data?.id) throw new Error('apify_run_id_missing');
  let run = started.data;
  try {
    while (!terminalStatuses.has(run.status)) {
      const polled = await apify(`actor-runs/${run.id}?waitForFinish=60`) as { data?: ActorRun };
      if (!polled.data) throw new Error('apify_run_status_missing');
      run = polled.data;
      process.stdout.write(`${candidate.id}/${plan.id}: ${run.status}\n`);
    }

    const durationMs = Math.max(0, new Date(run.finishedAt || new Date().toISOString()).getTime() - new Date(run.startedAt).getTime());
    let items: unknown[] = [];
    if (run.defaultDatasetId) {
      const response = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&limit=${plan.maxItems}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`apify_dataset_http_${response.status}`);
      items = await response.json() as unknown[];
    }
    return sanitizePlanResult(candidate, plan, items, durationMs, run.status, run.usageTotalUsd ?? run.usageUsd ?? null);
  } finally {
    await Promise.all([
      deleteStorage('datasets', run.defaultDatasetId),
      deleteStorage('key-value-stores', run.defaultKeyValueStoreId),
      deleteStorage('request-queues', run.defaultRequestQueueId),
    ]);
  }
}

for (const { candidate, plans } of runnable) {
  const results: SanitizedPlanResult[] = [];
  for (const plan of plans) {
    process.stdout.write(`Starting ${candidate.id}/${plan.id} with ${plan.inputUrls.length} bounded inputs\n`);
    results.push(await executePlan(candidate, plan));
  }
  const report = {
    schemaVersion: 1,
    passDate,
    generatedAt: new Date().toISOString(),
    candidate: {
      id: candidate.id,
      route: candidate.route,
      actorId: candidate.actorId,
      buildId: candidate.buildId,
      buildNumber: candidate.buildNumber,
      permissionLevel: candidate.permissionLevel,
    },
    storagePolicy: 'raw provider storage deleted after in-memory sanitization',
    summary: summarizeProviderResults(results),
    runs: results,
  };
  const output = path.resolve(`benchmarks/providers/results/${passDate}/${candidate.id}.json`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Sanitized report written: ${path.relative(process.cwd(), output)}\n`);
}
