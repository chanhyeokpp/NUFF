import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { measureEntry, summarizeBaseline, validateCorpus, type BaselineResult } from '../lib/extraction-baseline';

function argument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

async function mapConcurrent<T, R>(values: T[], limit: number, operation: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}

const corpusPath = path.resolve(argument('corpus', 'benchmarks/extraction/corpus.v1.json'));
const outputPath = path.resolve(argument('output', 'benchmarks/extraction/baseline.current.json'));
const concurrency = Number.parseInt(argument('concurrency', '4'), 10);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('concurrency_must_be_1_to_8');

const corpus = validateCorpus(JSON.parse(await readFile(corpusPath, 'utf8')));
const startedAt = new Date();
let completed = 0;
const results = await mapConcurrent(corpus.entries, concurrency, async entry => {
  const result = await measureEntry(entry, process.env.YOUTUBE_API_KEY ? { YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY } : {});
  completed += 1;
  process.stdout.write(`${completed}/${corpus.entries.length} ${entry.id} ${result.status} ${result.durationMs}ms\n`);
  return result;
});

const report: {
  schemaVersion: number;
  corpus: string;
  corpusSchemaVersion: number;
  generatedAt: string;
  completedAt: string;
  environment: { node: string; youtubeMetadataConfigured: boolean; concurrency: number };
  summary: ReturnType<typeof summarizeBaseline>;
  results: BaselineResult[];
} = {
  schemaVersion: 1,
  corpus: corpus.name,
  corpusSchemaVersion: corpus.schemaVersion,
  generatedAt: startedAt.toISOString(),
  completedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    youtubeMetadataConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    concurrency,
  },
  summary: summarizeBaseline(results),
  results,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`Baseline written to ${path.relative(process.cwd(), outputPath)}\n`);
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
