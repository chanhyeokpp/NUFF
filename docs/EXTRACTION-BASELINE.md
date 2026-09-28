# Extraction baseline

The stage-1 benchmark is a fixed, public-only comparison set for Nuff's current extractor and later provider candidates. It is measurement infrastructure, not production routing.

## Files

- `benchmarks/extraction/corpus.v1.json`: 30 ordinary-web, 20 YouTube, 20 Instagram, 20 TikTok, and negative cases.
- `benchmarks/extraction/baseline.current.json`: latest checked-in run with status, extraction mode, duration, and bounded metadata indicators.
- `lib/extraction-baseline.ts`: corpus validation, result measurement, and aggregation.
- `scripts/extraction-baseline.ts`: bounded-concurrency runner.

The corpus and report intentionally exclude page bodies, captions, transcripts, private URLs, credentials, user identifiers, and raw exception messages. A source becoming unavailable is a measured outcome; do not silently replace it between provider runs. Corpus changes require a schema/name change or a documented revision so comparisons remain honest.

## Run

```bash
npm run benchmark:extraction
```

Optional arguments are passed after `--`:

```bash
npm run benchmark:extraction -- --concurrency=2 --output=benchmarks/extraction/baseline.local.json
```

The default run does not load `.env` and makes no Gemini, OpenAI, or Apify calls. If `YOUTUBE_API_KEY` is explicitly present in the process environment, official YouTube metadata is measured and the report records only that it was configured, never its value.

`ready` means the current extractor returned enough readable source text. `needs_content` means the URL was retained but the extractor could not provide analyzable source content. `failed` means validation, DNS safety checking, timeout, or extraction threw a normalized error. Timings depend on network conditions, so reruns are reproducible in inputs and schema rather than byte-identical.

## Recorded baseline

The first run was recorded on 2026-09-28 with Node 24.19.0, concurrency 4, and no YouTube metadata credential:

| Source | Total | Ready | Needs content | Failed | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|
| Ordinary web | 30 | 24 | 5 | 1 | 639 ms | 2,992 ms |
| YouTube | 20 | 0 | 20 | 0 | 0 ms | 0 ms |
| Instagram | 20 | 0 | 20 | 0 | 464 ms | 630 ms |
| TikTok | 20 | 0 | 20 | 0 | 632 ms | 858 ms |
| Negative cases | 11 | 0 | 5 | 6 | 0 ms | 337 ms |

YouTube's zero-duration result is expected in this credential-free extractor run: the current extractor immediately returns `needs_content` when official metadata is not configured. It does not measure the configured Gemini video-analysis path. Instagram and TikTok returned preview-only results, confirming the coverage gap that stage 2 evaluates.

One negative case exposed a validation gap: a YouTube URL with a nonstandard port reaches the YouTube early-return path and becomes `needs_content` instead of being rejected. The baseline preserves that behavior; source-router work in stage 5 must add a regression test and close it rather than hiding it in the benchmark.

## Stage-2 use

Provider candidates must use the unchanged platform subset from this corpus. Actor results are recorded separately and run twice on different days before a route decision. Paid calls and Actor selection remain blocked until explicitly approved.
