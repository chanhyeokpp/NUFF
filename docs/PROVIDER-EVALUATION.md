# Provider evaluation

Stage 2 compares extraction providers without changing the Kakao UI, request path, production Worker, or D1 data. No Actor is approved from Store claims alone.

## Candidate policy

The fixed candidate snapshot is `benchmarks/providers/candidates.v1.json`. Every candidate:

- accepts only public URLs from the stage-1 corpus;
- has an immutable Actor build ID and build number;
- uses Apify limited permissions;
- has an explicit per-run cost ceiling no higher than USD 0.50;
- is evaluated without cookies, login sessions, user IDs, notes, or pasted private content;
- returns raw data only to memory, after which the evaluation script stores metrics and deletes its temporary dataset, key-value store, and request queue.

Community Actors are not Apify subprocessors automatically. Their creators may have access to inputs and outputs allowed by the Actor permission model, so production eligibility requires both technical results and acceptable creator terms. Apify's unnamed storage retention documentation varies by plan and page; Nuff therefore does not rely on automatic expiry and explicitly deletes evaluation storage after collection.

## Shortlist observed on 2026-09-29

| Route | Candidate | Build | Maintainer | Current free-tier event price | Reason to test |
|---|---|---|---|---:|---|
| Instagram | `apify/instagram-scraper` | `0.0.788` | Apify | $0.0027/result | strongest maintenance and adoption |
| Instagram | `apidojo/instagram-scraper` | `0.0.1077` | Community | $0.0005/post | lower cost; free plan is limited to five 10-item runs |
| TikTok | `clockworks/tiktok-scraper` | `0.0.610` | Apify | $0.0037/result + $0.001/run | mature, widely used baseline |
| TikTok | `get-leads/all-in-one-tiktok-scraper` | `0.1.224` | Community | $0.005/video + $0.00005/run | second implementation and compatible fields |
| YouTube captions | `prodiger/youtube-transcript-scraper---transcriber` | `0.5.11` | Community | $0.005/transcript + $0.003/run | explicit caption-only mode and skip reasons |
| YouTube captions | `insight.solutions/youtube-transcript-api` | `0.1.15` | Community | $0.00095/transcript + $0.001/run | timed segments and diagnostic rows |
| Web fallback | `apify/website-content-crawler` | `0.3.97` | Apify | measured platform usage | test only the seven direct-failure/inaccessible cases |

Prices are a dated snapshot from Apify API v2 and may change. The runner always sends both `maxItems` and `maxTotalChargeUsd`; the candidate file, not Store copy, is the evaluation source of truth.

## Evaluation rules

Each candidate uses the same relevant, de-duplicated stage-1 cases. Duplicate prevention belongs to Nuff before provider dispatch; the evaluator still counts any duplicate outputs returned by a provider. The report keeps only case ID, normalized outcome, timing, boolean content indicators, mapping counts, and aggregate cost. It never stores captions, transcripts, page text, titles, author names, thumbnails, raw errors, run IDs, dataset IDs, or tokens.

The production gate remains:

- metadata success at least 90%;
- explicit result or normalized reason at least 95%;
- zero unmapped cross-input results;
- measured cost within the product budget;
- the same pinned build passes on two different dates.

Transcript yield and timestamp coverage are reported separately. YouTube transcript Actors remain fallback-only: a passing caption benchmark does not authorize calling them before Gemini reports `video_unavailable`.

`benchmarks/providers/youtube-fallback-cases.v1.json` is intentionally empty until configured Gemini measurements produce public `video_unavailable` cases. The runner skips both YouTube candidates while it is empty; arbitrary YouTube corpus entries cannot be substituted. The eligibility probe discards Gemini's generated analysis and stores only case ID, availability class, duration, date, and model.

## Pass 1 — 2026-09-29

The committed reports are under `benchmarks/providers/results/2026-09-29`. This is evidence from the first date only, not a production approval.

| Candidate | Public success | Explicit coverage | Mapping | p95 | Reported cost | Pass-1 outcome |
|---|---:|---:|---:|---:|---:|---|
| `apify/instagram-scraper@0.0.788` | 16/20 (80%) | 100% | clean | 92.375 s | $0.0486 | failed 90% success gate |
| `apidojo/instagram-scraper@0.0.1077` | 0/20 | 0% | 30 unmapped | 5.219 s | $0 | unsuitable for direct-post mapping |
| `clockworks/tiktok-scraper@0.0.610` | 18/20 (90%) | 100% | clean | 46.773 s | $0.0750 | passed first-date gate |
| `get-leads/all-in-one-tiktok-scraper@0.1.224` | 18/20 (90%) | 100% | 2 unmapped | 32.926 s | $0.09005 | failed unambiguous-mapping gate |
| `apify/website-content-crawler@0.3.97` | 4/6 direct failures recovered | 5/7 | clean | 33.304 s | $0.00885 | useful improvement, but below generic Actor gate |

The web row is judged again under T005's narrower fallback criterion after a different-day rerun. Its first diagnostic run cost $0.01113 before the inaccessible-case false-positive check was corrected; including that discarded diagnostic, observed Apify usage for this date was approximately $0.23363, within the free-plan credit.

Gemini checked 20 public YouTube cases without storing generated content: 14 were directly analyzable, zero returned `video_unavailable`, and six remained `probe_failed` after three attempts. Because there were no valid fallback-eligible cases, neither YouTube transcript Actor was called.

## Pass 2 — 2026-09-30

| Candidate | Public success | Explicit coverage | Mapping | p95 | Reported cost | Final outcome |
|---|---:|---:|---:|---:|---:|---|
| `apify/instagram-scraper@0.0.788` | 16/20 (80%) | 100% | clean | 100.659 s | $0.0513 | failed on both dates; blocked |
| `apidojo/instagram-scraper@0.0.1077` | not rerun | — | schema disqualified on pass 1 | — | $0 | rejected; five-run free limit also prevents a full second corpus |
| `clockworks/tiktok-scraper@0.0.610` | 18/20 (90%) | 100% | clean | 37.901 s | $0.0713 | passed both dates; approved candidate |
| `get-leads/all-in-one-tiktok-scraper@0.1.224` | 18/20 (90%) | 100% | 2 unmapped | 32.834 s | $0.09005 | mapping failure reproduced; rejected |
| `apify/website-content-crawler@0.3.97` | 4/6 direct failures recovered | 5/7 | clean | 91.191 s | $0.02979 | approve only after direct failure |

The second Gemini eligibility measurement produced one direct-video success, zero `video_unavailable` outcomes, and 19 bounded `probe_failed` outcomes. This instability is evidence against broadening the fallback trigger: only the explicit `video_unavailable` code may use a transcript Actor. No YouTube Actor was called on either date.

Observed Apify usage across both dated evaluations, including the discarded first-day web diagnostic, was approximately USD 0.4761. This was inside the free-plan credit. Cost caps remain mandatory because Store pricing can change.

## Final route decisions

- Instagram: blocked; keep honest preview/`needs_content` behavior.
- TikTok: approve only `clockworks/tiktok-scraper@0.0.610` for later flagged, asynchronous integration.
- YouTube: keep Gemini-first and official metadata fallback; do not configure a transcript Actor yet.
- Ordinary web: allow `apify/website-content-crawler@0.3.97` only after direct extraction fails, with a one-page bound, budget gate, and explicit missing-result handling.

## Running a pass

The command is intentionally fail-closed. Without all three controls it prints the maximum exposure and starts nothing:

```bash
npm run benchmark:providers -- --candidate=all
```

YouTube eligibility has a separate request-count approval because the Gemini API does not expose an equivalent per-run dollar ceiling:

```bash
npm run benchmark:youtube-eligibility -- --pass-date=YYYY-MM-DD --confirm-external-run=YES --max-approved-requests=20
```

This command requires `GEMINI_API_KEY` in the ignored `.env`, retries bounded transient failures, records unresolved cases without treating them as fallback-eligible, and will not overwrite an existing dated report. The YouTube URL feature was a no-charge Preview at the 2026-09-29 check; the explicit flag approves external requests and quota use rather than a dollar charge.

To perform an approved pass, create a short-lived scoped Apify token in **Settings → API & Integrations**, give it only Actor-run and generated-storage access, and place it in the ignored local `.env` as `APIFY_API_TOKEN`. Never paste the token into chat, source, a command argument, or a committed document.

Then run with the exact approved ceiling:

```bash
npm run benchmark:providers -- --candidate=all --pass-date=YYYY-MM-DD --confirm-paid-run=YES --max-approved-usd=0.98
```

With the YouTube fallback set still empty, the runnable Instagram, TikTok, and web candidates have a combined one-pass ceiling of USD 0.98. After eligible YouTube cases are recorded, the runner recomputes the ceiling; all seven candidates currently total USD 1.16. Expected actual usage is lower, but the displayed maximum is what must be approved. A second pass must run on a later date against the same candidate builds and corpus. Only after both reports exist may T002–T005 be marked complete or explicitly blocked.

## Sources checked

- https://docs.apify.com/api/v2/actors-actor-runs
- https://docs.apify.com/integrations/api
- https://docs.apify.com/actors/running/permissions
- https://docs.apify.com/storage
- https://docs.apify.com/legal/actor-terms-and-conditions
- Candidate Store pages listed in the manifest
