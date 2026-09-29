import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validateCorpus } from '../lib/extraction-baseline';
import { GeminiVideoProvider } from '../lib/pipeline';

type EligibilityResult = {
  caseId: string;
  status: 'direct_video_available' | 'video_unavailable' | 'probe_failed';
  durationMs: number;
  attempts: number;
  errorCode?: 'gemini_rate_limited' | 'gemini_video_failed' | 'unexpected_response';
};

function argument(name: string, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function safeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('pass_date_must_be_yyyy_mm_dd');
  return value;
}

const key = process.env.GEMINI_API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const confirmed = argument('confirm-external-run') === 'YES' || argument('confirm-paid-run') === 'YES';
const approvedRequests = Number.parseInt(argument('max-approved-requests', '0'), 10);
const passDate = safeDate(argument('pass-date', new Date().toISOString().slice(0, 10)));
const corpus = validateCorpus(JSON.parse(await readFile('benchmarks/extraction/corpus.v1.json', 'utf8')));
const cases = corpus.entries.filter(entry => entry.source === 'youtube');
const reportPath = path.resolve(`benchmarks/providers/results/${passDate}/youtube-gemini-eligibility.json`);

process.stdout.write(`Gemini direct-video eligibility requests: ${cases.length}\n`);
if (!key || !confirmed || approvedRequests < cases.length) {
  process.stdout.write('Dry gate only: no Gemini request was started. Provide GEMINI_API_KEY, --confirm-external-run=YES, and --max-approved-requests at or above the displayed count.\n');
  process.exit(2);
}
try {
  await stat(reportPath);
  throw new Error('dated_eligibility_report_already_exists');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const provider = new GeminiVideoProvider({ GEMINI_API_KEY: key, GEMINI_MODEL: model });
const results: EligibilityResult[] = [];
for (const entry of cases) {
  const started = performance.now();
  let completed = false;
  for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
    try {
      await provider.analyze(entry.url);
      results.push({ caseId: entry.id, status: 'direct_video_available', durationMs: Math.round(performance.now() - started), attempts: attempt });
      completed = true;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'gemini_video_failed';
      if (code === 'gemini_auth_failed') throw new Error('eligibility_probe_stopped:gemini_auth_failed');
      if (code === 'gemini_video_unavailable') {
        results.push({ caseId: entry.id, status: 'video_unavailable', durationMs: Math.round(performance.now() - started), attempts: attempt });
        completed = true;
        continue;
      }
      const normalized = ['gemini_rate_limited', 'gemini_video_failed'].includes(code) ? code as 'gemini_rate_limited' | 'gemini_video_failed' : 'unexpected_response';
      if (attempt === 3) {
        results.push({ caseId: entry.id, status: 'probe_failed', durationMs: Math.round(performance.now() - started), attempts: attempt, errorCode: normalized });
        completed = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  }
  process.stdout.write(`${results.length}/${cases.length} ${entry.id} ${results.at(-1)?.status}\n`);
}

const caseIds = results.filter(result => result.status === 'video_unavailable').map(result => result.caseId);
const generatedAt = new Date().toISOString();
const failedCount = results.filter(result => result.status === 'probe_failed').length;
const report = {
  schemaVersion: 1,
  passDate,
  generatedAt,
  corpus: corpus.name,
  model,
  contentStored: false,
  status: failedCount ? 'partial' : 'complete',
  results,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
await writeFile('benchmarks/providers/youtube-fallback-cases.v1.json', `${JSON.stringify({
  schemaVersion: 1,
  sourceCorpus: 'benchmarks/extraction/corpus.v1.json',
  selectionRule: 'Public YouTube cases for which configured Gemini returned video_unavailable',
  status: failedCount ? 'measured_with_probe_failures' : 'measured',
  observedAt: generatedAt,
  model,
  caseIds,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`Sanitized eligibility report written: ${path.relative(process.cwd(), reportPath)}\n`);
process.stdout.write(`Eligible YouTube fallback cases: ${caseIds.length}\n`);
process.stdout.write(`Unresolved Gemini probe failures: ${failedCount}\n`);
