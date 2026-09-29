import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validateCorpus } from '../lib/extraction-baseline';
import { GeminiVideoProvider } from '../lib/pipeline';

type EligibilityResult = {
  caseId: string;
  status: 'direct_video_available' | 'video_unavailable';
  durationMs: number;
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
const confirmed = argument('confirm-paid-run') === 'YES';
const approvedRequests = Number.parseInt(argument('max-approved-requests', '0'), 10);
const passDate = safeDate(argument('pass-date', new Date().toISOString().slice(0, 10)));
const corpus = validateCorpus(JSON.parse(await readFile('benchmarks/extraction/corpus.v1.json', 'utf8')));
const cases = corpus.entries.filter(entry => entry.source === 'youtube');
const reportPath = path.resolve(`benchmarks/providers/results/${passDate}/youtube-gemini-eligibility.json`);

process.stdout.write(`Gemini direct-video eligibility requests: ${cases.length}\n`);
if (!key || !confirmed || approvedRequests < cases.length) {
  process.stdout.write('Dry gate only: no Gemini request was started. Provide GEMINI_API_KEY, --confirm-paid-run=YES, and --max-approved-requests at or above the displayed count.\n');
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
  try {
    await provider.analyze(entry.url);
    results.push({ caseId: entry.id, status: 'direct_video_available', durationMs: Math.round(performance.now() - started) });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'gemini_video_failed';
    if (code !== 'gemini_video_unavailable') {
      const normalized = ['gemini_auth_failed', 'gemini_rate_limited', 'gemini_video_failed'].includes(code) ? code : 'unexpected_response';
      throw new Error(`eligibility_probe_stopped:${normalized}`);
    }
    results.push({ caseId: entry.id, status: 'video_unavailable', durationMs: Math.round(performance.now() - started) });
  }
  process.stdout.write(`${results.length}/${cases.length} ${entry.id} ${results.at(-1)?.status}\n`);
}

const caseIds = results.filter(result => result.status === 'video_unavailable').map(result => result.caseId);
const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  passDate,
  generatedAt,
  corpus: corpus.name,
  model,
  contentStored: false,
  results,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
await writeFile('benchmarks/providers/youtube-fallback-cases.v1.json', `${JSON.stringify({
  schemaVersion: 1,
  sourceCorpus: 'benchmarks/extraction/corpus.v1.json',
  selectionRule: 'Public YouTube cases for which configured Gemini returned video_unavailable',
  status: 'measured',
  observedAt: generatedAt,
  model,
  caseIds,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`Sanitized eligibility report written: ${path.relative(process.cwd(), reportPath)}\n`);
process.stdout.write(`Eligible YouTube fallback cases: ${caseIds.length}\n`);
