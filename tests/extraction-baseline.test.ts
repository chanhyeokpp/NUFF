import assert from 'node:assert/strict';
import test from 'node:test';
import { extractionMode, measureEntry, summarizeBaseline, validateCorpus, type CorpusEntry } from '../lib/extraction-baseline';

const publicEntries = [
  ...Array.from({ length: 30 }, (_, index) => ({ id: `web-${index}`, source: 'web', case: 'public', url: `https://web-${index}.example.com/` })),
  ...Array.from({ length: 20 }, (_, index) => ({ id: `youtube-${index}`, source: 'youtube', case: 'public', url: `https://www.youtube.com/watch?v=${String(index).padStart(11, 'a')}` })),
  ...Array.from({ length: 20 }, (_, index) => ({ id: `instagram-${index}`, source: 'instagram', case: 'public', url: `https://www.instagram.com/p/TestCode${index}/` })),
  ...Array.from({ length: 20 }, (_, index) => ({ id: `tiktok-${index}`, source: 'tiktok', case: 'public', url: `https://www.tiktok.com/@test/video/${String(7000000000000000000n + BigInt(index))}` })),
] as CorpusEntry[];

const validCorpus = {
  schemaVersion: 1,
  name: 'test',
  description: 'public URLs only',
  entries: [
    ...publicEntries,
    { id: 'negative-inaccessible', source: 'negative', case: 'inaccessible', url: 'https://missing.example.com/' },
    { id: 'negative-malformed', source: 'negative', case: 'malformed', url: 'not-a-url' },
    { id: 'negative-deceptive', source: 'negative', case: 'deceptive_host', url: 'https://youtube.com.evil.example/' },
  ],
};

test('baseline corpus enforces source minimums and negative categories', () => {
  assert.equal(validateCorpus(validCorpus).entries.length, 93);
  assert.throws(() => validateCorpus({ ...validCorpus, entries: validCorpus.entries.filter(entry => entry.id !== 'web-0') }), /corpus_minimum_missing:web/);
  assert.throws(() => validateCorpus({ ...validCorpus, entries: validCorpus.entries.filter(entry => entry.case !== 'deceptive_host') }), /corpus_negative_missing:deceptive_host/);
});

test('extraction mode reports current no-credential routes', () => {
  assert.equal(extractionMode('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube_metadata_unconfigured');
  assert.equal(extractionMode('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { YOUTUBE_API_KEY: 'configured' }), 'youtube_official_metadata');
  assert.equal(extractionMode('https://www.instagram.com/reel/example/'), 'instagram_public_preview');
  assert.equal(extractionMode('https://www.tiktok.com/@user/video/123'), 'tiktok_public_preview');
  assert.equal(extractionMode('not a URL'), 'validation');
});

test('measurement stores metrics but not extracted content', async () => {
  const entry: CorpusEntry = { id: 'web-one', source: 'web', case: 'public', url: 'https://example.com/' };
  const ready = await measureEntry(entry, {}, async () => ({ title: 'Title', text: 'private body must not be stored', description: '', thumbnail: undefined, readable: true }));
  assert.equal(ready.status, 'ready');
  assert.equal(ready.characterCount, 31);
  assert.equal('text' in ready, false);
  const failed = await measureEntry(entry, {}, async () => { throw new Error('fetch failed'); });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'extraction_error');
});

test('summary records status counts and latency percentiles by source', () => {
  const base = { case: 'public' as const, url: 'https://example.com/', extractionMode: 'direct_html', characterCount: 0, hasDescription: false, hasThumbnail: false };
  const summary = summarizeBaseline([
    { ...base, id: 'one', source: 'web', status: 'ready', durationMs: 10 },
    { ...base, id: 'two', source: 'web', status: 'needs_content', durationMs: 20 },
    { ...base, id: 'three', source: 'web', status: 'failed', durationMs: 100 },
  ]);
  assert.deepEqual(summary.web, { total: 3, ready: 1, needsContent: 1, failed: 1, p50DurationMs: 20, p95DurationMs: 100 });
});
