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

Each candidate uses the same relevant stage-1 cases and receives one deliberate duplicate. The report keeps only case ID, normalized outcome, timing, boolean content indicators, mapping counts, and aggregate cost. It never stores captions, transcripts, page text, titles, author names, thumbnails, raw errors, run IDs, dataset IDs, or tokens.

The production gate remains:

- metadata success at least 90%;
- explicit result or normalized reason at least 95%;
- zero unmapped cross-input results;
- measured cost within the product budget;
- the same pinned build passes on two different dates.

Transcript yield and timestamp coverage are reported separately. YouTube transcript Actors remain fallback-only: a passing caption benchmark does not authorize calling them before Gemini reports `video_unavailable`.

`benchmarks/providers/youtube-fallback-cases.v1.json` is intentionally empty until configured Gemini measurements produce public `video_unavailable` cases. The runner skips both YouTube candidates while it is empty; arbitrary YouTube corpus entries cannot be substituted. The eligibility probe discards Gemini's generated analysis and stores only case ID, availability class, duration, date, and model.

## Running a pass

The command is intentionally fail-closed. Without all three controls it prints the maximum exposure and starts nothing:

```bash
npm run benchmark:providers -- --candidate=all
```

YouTube eligibility has a separate request-count approval because the Gemini API does not expose an equivalent per-run dollar ceiling:

```bash
npm run benchmark:youtube-eligibility -- --pass-date=YYYY-MM-DD --confirm-paid-run=YES --max-approved-requests=20
```

This command requires `GEMINI_API_KEY` in the ignored `.env`, stops on authentication, rate-limit, or transient errors, and will not overwrite an existing dated report.

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
