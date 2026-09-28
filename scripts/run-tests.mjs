import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const testDirectory = path.resolve('tests');
const outputDirectory = path.resolve('.sites-runtime/tests');
const tests = (await readdir(testDirectory)).filter(file => file.endsWith('.test.ts')).sort();
await mkdir(outputDirectory, { recursive: true });

const outputs = [];
for (const file of tests) {
  const output = path.join(outputDirectory, file.replace(/\.ts$/, '.mjs'));
  const build = spawnSync(path.resolve('node_modules/.bin/esbuild'), [path.join(testDirectory, file), '--bundle', '--platform=node', '--format=esm', `--outfile=${output}`], {
    stdio: 'inherit',
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  outputs.push(output);
}

const run = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit' });
process.exit(run.status ?? 1);
