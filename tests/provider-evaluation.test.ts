import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildEvaluationPlans, sanitizePlanResult, summarizeProviderResults, validateCandidateManifest, type ProviderCandidate } from '../lib/provider-evaluation';
import { validateCorpus, type BaselineResult } from '../lib/extraction-baseline';

const manifest = validateCandidateManifest(JSON.parse(readFileSync('benchmarks/providers/candidates.v1.json', 'utf8')));
const corpus = validateCorpus(JSON.parse(readFileSync('benchmarks/extraction/corpus.v1.json', 'utf8')));
const baseline = JSON.parse(readFileSync('benchmarks/extraction/baseline.current.json', 'utf8')) as { results: BaselineResult[] };

function candidate(id: string) {
  const value = manifest.candidates.find(item => item.id === id);
  if (!value) throw new Error('missing test candidate');
  return value;
}

test('candidate manifest pins limited-permission builds and bounded costs', () => {
  assert.equal(manifest.candidates.length, 7);
  assert.equal(new Set(manifest.candidates.map(item => item.buildId)).size, 7);
  assert.ok(manifest.candidates.every(item => item.permissionLevel === 'LIMITED_PERMISSIONS'));
  assert.ok(manifest.candidates.every(item => item.maxChargeUsdPerRun <= 0.5));
});

test('evaluation plans use only the fixed corpus and the direct web failures', () => {
  const instagramPlans = buildEvaluationPlans(candidate('instagram-apify-official'), corpus, baseline.results);
  assert.equal(instagramPlans.flatMap(plan => plan.caseIds).length, 21);
  assert.ok(instagramPlans.every(plan => plan.maxItems <= 100));
  assert.ok(instagramPlans.every(plan => new Set(plan.inputUrls).size === plan.inputUrls.length));
  const webPlans = buildEvaluationPlans(candidate('web-apify-content-crawler'), corpus, baseline.results);
  assert.equal(webPlans[0].caseIds.length, 7);
  assert.ok(webPlans[0].caseIds.includes('web-030'));
  assert.ok(webPlans[0].caseIds.includes('negative-inaccessible-web'));
});

test('sanitizer measures Instagram metadata without retaining captions', () => {
  const selected = candidate('instagram-apify-official');
  const plan = buildEvaluationPlans(selected, corpus, baseline.results)[0];
  const code = new URL(plan.inputUrls[0]).pathname.split('/')[2];
  const result = sanitizePlanResult(selected, { ...plan, caseIds: [plan.caseIds[0]], inputUrls: [plan.inputUrls[0]] }, [{ shortCode: code, caption: 'must never enter the report', ownerUsername: 'public-author', timestamp: '2026-01-01T00:00:00Z' }], 500, 'SUCCEEDED', 0.0027);
  assert.equal(result.cases[0].status, 'metadata_success');
  assert.equal(result.cases[0].hasCaption, true);
  assert.equal(JSON.stringify(result).includes('must never enter'), false);
});

test('sanitizer records transcript timestamps, explicit failures, and missing rows', () => {
  const selected = candidate('youtube-insight-solutions');
  const eligible = corpus.entries.filter(entry => entry.source === 'youtube').slice(0, 3).map(entry => entry.id);
  const plans = buildEvaluationPlans(selected, corpus, baseline.results, eligible);
  const base = plans[0];
  const subset = { ...base, caseIds: base.caseIds.slice(0, 3), inputUrls: base.inputUrls.slice(0, 3) };
  const ids = subset.inputUrls.map(url => new URL(url).searchParams.get('v'));
  const result = sanitizePlanResult(selected, subset, [
    { ok: true, videoId: ids[0], text: 'not persisted', segments: [{ start: 1.2, duration: 2, text: 'not persisted either' }] },
    { ok: false, videoId: ids[1], errorType: 'NO_CAPTIONS', error: 'not persisted' },
  ], 900, 'SUCCEEDED', 0.00195);
  assert.equal(result.cases[0].status, 'transcript_success');
  assert.equal(result.cases[0].hasTimestamps, true);
  assert.equal(result.cases[1].status, 'explicit_failure');
  assert.equal(result.cases[1].errorCode, 'no_captions');
  assert.equal(result.cases[2].status, 'missing');
  assert.equal(JSON.stringify(result).includes('not persisted'), false);
});

test('YouTube Actor planning is blocked until Gemini reports eligible video-unavailable cases', () => {
  const selected = candidate('youtube-prodiger');
  assert.deepEqual(buildEvaluationPlans(selected, corpus, baseline.results), []);
  const eligible = corpus.entries.find(entry => entry.source === 'youtube')?.id;
  assert.ok(eligible);
  const plans = buildEvaluationPlans(selected, corpus, baseline.results, [eligible]);
  assert.deepEqual(plans[0].caseIds, [eligible]);
});

test('summary applies the documented provider gate', () => {
  const fakeCandidate = candidate('tiktok-clockworks') as ProviderCandidate;
  const plan = buildEvaluationPlans(fakeCandidate, corpus, baseline.results)[0];
  const items = plan.inputUrls.slice(0, 20).map(url => ({ id: new URL(url).pathname.match(/\/video\/(\d+)/)?.[1], text: 'caption' }));
  const result = sanitizePlanResult(fakeCandidate, { ...plan, caseIds: plan.caseIds.slice(0, 20), inputUrls: plan.inputUrls.slice(0, 20) }, items, 1200, 'SUCCEEDED', 0.075);
  const summary = summarizeProviderResults([result]);
  assert.equal(summary.metadataSuccessRate, 1);
  assert.equal(summary.gate.metadataSuccess, true);
  assert.equal(summary.gate.explicitCoverage, true);
  assert.equal(summary.gate.unambiguousMapping, true);
});

test('an inaccessible benchmark case cannot pass from a long error page', () => {
  const selected = candidate('web-apify-content-crawler');
  const plan = buildEvaluationPlans(selected, corpus, baseline.results)[0];
  const index = plan.caseIds.indexOf('negative-inaccessible-web');
  assert.ok(index >= 0);
  const subset = { ...plan, caseIds: [plan.caseIds[index]], inputUrls: [plan.inputUrls[index]] };
  const result = sanitizePlanResult(selected, subset, [{ url: subset.inputUrls[0], text: 'x'.repeat(200) }], 100, 'SUCCEEDED', 0.001);
  assert.equal(result.cases[0].status, 'explicit_failure');
  assert.equal(result.cases[0].errorCode, 'unexpected_success_for_inaccessible_case');
});

test('two dated reports support the recorded final route decisions', () => {
  const report = (date: string, id: string) => JSON.parse(readFileSync(`benchmarks/providers/results/${date}/${id}.json`, 'utf8'));
  const instagram = ['2026-09-29', '2026-09-30'].map(date => report(date, 'instagram-apify-official'));
  const clockworks = ['2026-09-29', '2026-09-30'].map(date => report(date, 'tiktok-clockworks'));
  const getLeads = ['2026-09-29', '2026-09-30'].map(date => report(date, 'tiktok-get-leads'));
  const web = ['2026-09-29', '2026-09-30'].map(date => report(date, 'web-apify-content-crawler'));
  const youtube = ['2026-09-29', '2026-09-30'].map(date => report(date, 'youtube-gemini-eligibility'));

  assert.deepEqual(instagram.map(value => value.summary.metadataSuccessRate), [0.8, 0.8]);
  assert.ok(clockworks.every(value => value.candidate.buildNumber === '0.0.610' && Object.values(value.summary.gate).every(Boolean)));
  assert.ok(getLeads.every(value => value.summary.unmappedResultCount === 2 && value.summary.gate.unambiguousMapping === false));
  assert.deepEqual(web.map(value => value.summary.successfulPublicCases), [4, 4]);
  assert.ok(youtube.every(value => value.results.every((item: { status: string }) => item.status !== 'video_unavailable')));
});
