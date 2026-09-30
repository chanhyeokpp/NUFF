# Tasks: Multi-source public-link ingestion

Status: stage 2 complete

Specification: `spec.md`  
Technical plan: `plan.md`

## 12-stage delivery roadmap

This roadmap is the user-facing development sequence. Detailed task IDs below remain the completion checklist. Each stage ends with a tested, commit-ready checkpoint; later stages must not be required for the current app to keep working.

| Stage | Scope | Detailed tasks | Expected active time | External wait or user boundary |
|---:|---|---|---:|---|
| 1/12 | Baseline corpus and current metrics | T001 | 2–3 hours | Sanitized public test URLs may need review |
| 2/12 | Provider evaluation and route decisions | T002–T005 | 3–5 hours | Actor tests must be repeated on a different day; paid Actor selection needs user approval |
| 3/12 | D1 schema and repository foundation | T101–T102 | 3–5 hours | Production migration is not applied in this stage |
| 4/12 | Compatibility and telemetry | T103–T104 | 2–4 hours | None for local implementation |
| 5/12 | Source classifier and normalized document contracts | T201–T203 | 3–5 hours | None for local implementation |
| 6/12 | Extraction/analysis separation | T204 | 2–3 hours | None for local implementation |
| 7/12 | Apify gateway and secure callback | T301–T304 | 4–6 hours | Requires Apify configuration; secret entry stays outside the repository |
| 8/12 | First social route, then remaining approved fallbacks | T305 plus approved outcomes from T002–T005 | 3–5 hours | Paid calls and live canary require user approval |
| 9/12 | Queue, batching, retries, and recovery | T401–T405 | 5–8 hours | Cloudflare production bindings and deployment require user approval |
| 10/12 | Shared public-document reuse and backfill | T501–T505 | 5–8 hours | Production backfill/canary requires user approval |
| 11/12 | Evidence-backed analysis | T601–T603 | 3–5 hours | Live model quality sampling may require configured API keys |
| 12/12 | Operations, budgets, regression, and rollout | T701–T705 | 5–8 hours | Production deployment, external consoles, and real-device verification require the user |

Expected total active work: roughly 40–65 hours. Calendar time can be longer because provider evaluation intentionally spans more than one day and production gates require observation.

### Progress communication contract

- Start: `Nuff 개발 X/12단계 — <단계명> 시작 · 예상 <활성 작업 시간>`
- Completion: `X/12단계 완료 — <검증 결과>. 다음은 Y/12단계 — <단계명> · 예상 <시간>, 시작합니다.`
- Continue automatically across stages when the user's request covers the remaining roadmap; do not wait for routine confirmation.
- Before an external boundary, finish every safe local task first, then ask for the smallest required user action in one message.
- If interrupted, record the exact stage and task IDs completed so the next session resumes without repeating work.

## Execution rules

- Work in task order unless a task explicitly lists no dependency.
- Do not mark a task complete until its tests and exit condition pass.
- Preserve unrelated user changes.
- Use forward-only migrations and backward-compatible reads during rollout.
- Never add a production secret to the repository, command output, fixture, or document.
- Actor selection tasks produce evidence in `plan.md`; implementation must not guess a community Actor.
- After each delivery stage, run the complete repository test suite, source lint excluding generated output, and the production build. Record the actual test count instead of assuming a fixed number.

## Phase 0 — Baseline and provider evidence

- [x] **T001 Record current extraction baseline**
  - Build a sanitized fixed corpus with ordinary web, YouTube, Instagram, TikTok, inaccessible, malformed, and deceptive-host cases.
  - Record current ready/needs-content/failed result, duration, and extraction mode.
  - Do not commit private URLs, credentials, or copyrighted transcripts.
  - Exit: baseline output is reproducible and contains at least 30 ordinary-web, 20 YouTube, 20 Instagram, and 20 TikTok public cases plus negative cases.

- [x] **T002 Evaluate Instagram Actor candidates**
  - Depends on T001.
  - Test at least two maintained candidates on the same corpus twice on different days.
  - Record pinned Actor/build, schema, metadata success, explicit failure coverage, duration, and cost in `plan.md`.
  - Exit: one candidate passes the Actor gate or the route remains explicitly blocked.
  - Pass 1 on 2026-09-29: official candidate reached 80%; API Dojo output could not map to direct post inputs. Both remain below gate; different-day confirmation remains.
  - Pass 2 on 2026-09-30: official candidate again reached 80%. API Dojo was not rerun because its direct-post schema/mapping was already disqualifying and the free-plan five-run limit cannot cover a second full corpus; the route is explicitly blocked under D-008.

- [x] **T003 Evaluate TikTok Actor candidates**
  - Depends on T001.
  - Apply the same evidence requirements as T002.
  - Exit: one candidate passes or the route remains explicitly blocked.
  - Pass 1 on 2026-09-29: Clockworks passed at 90% with clean mapping; Get Leads reached 90% but returned two unmapped results. Different-day confirmation remains.
  - Pass 2 on 2026-09-30 reproduced both outcomes. Clockworks `0.0.610` is approved under D-009; Get Leads is rejected.

- [x] **T004 Evaluate YouTube transcript fallback**
  - Depends on T001.
  - Test only as a fallback for Gemini video-unavailable cases.
  - Verify transcript language, timestamps, missing-caption behavior, and cost.
  - Exit: candidate passes or metadata-only remains the documented fallback.
  - Pass 1 eligibility on 2026-09-29: 14 direct-video successes, zero `video_unavailable`, and six unresolved probes. No transcript Actor was called; repeat eligibility measurement remains.
  - Pass 2 eligibility on 2026-09-30: one direct-video success, zero `video_unavailable`, and 19 unresolved probes. No valid fallback corpus exists, so no transcript Actor is approved and metadata-only remains the documented fallback under D-010.

- [x] **T005 Decide ordinary-web paid fallback**
  - Depends on T001.
  - Compare the approved Apify web candidate with current direct extraction only on direct failures.
  - Exit: enable only if readable-result improvement justifies measured cost and latency.
  - Pass 1 on 2026-09-29: recovered four of six current direct failures at $0.00221 per recovered page and 33.304 s p95; different-day cost/latency confirmation remains.
  - Pass 2 on 2026-09-30: recovered the same four of six at $0.00745 per recovered page and 91.191 s p95. Approved only as an asynchronous direct-failure fallback under D-011.

## Phase 1 — Schema, compatibility, and telemetry

- [ ] **T101 Add forward-only D1 migration**
  - Create `source_documents`, `source_snapshots`, `analysis_artifacts`, `provider_runs`, and `provider_run_documents`.
  - Add nullable `document_id` to `capture_jobs` and required indexes.
  - Update `db/schema.ts` so schema declarations and migrations no longer drift for the new tables.
  - Exit: migration applies to an empty DB and a DB containing all current migrations.

- [ ] **T102 Add typed repository layer**
  - Depends on T101.
  - Centralize document lookup/create, snapshot insertion, artifact activation, provider-run transitions, and capture attachment.
  - Enforce immutable snapshots/artifacts and state fences.
  - Exit: repository unit tests cover duplicate canonical URLs, concurrent creation, and stale completion.

- [ ] **T103 Add compatibility projection**
  - Depends on T102.
  - Project the active artifact into the current `Item` response shape.
  - Fall back to legacy `contents.data` when no active artifact exists.
  - Exit: current Kakao and `/captures` response contract tests pass unchanged.

- [ ] **T104 Record processing telemetry**
  - Depends on T102.
  - Record provider, operation, versions, timing, outcome, counts, cost, and normalized error without sensitive payloads.
  - Exit: every tested terminal provider attempt has exactly one terminal provider-run record.

## Phase 2 — Source routing and extractor contracts

- [ ] **T201 Extract source classifier**
  - Create a pure host/path classifier with deceptive-host and URL-normalization tests.
  - Exit: ordinary web, YouTube variants, Instagram post/Reel, TikTok video, and unsupported URLs are unambiguous.

- [ ] **T202 Introduce `SourceDocument` validation**
  - Define strict schema and bounded block/text sizes.
  - Preserve locator and timestamps.
  - Exit: malformed provider output fails before persistence.

- [ ] **T203 Introduce extractor interfaces**
  - Depends on T201 and T202.
  - Move current ordinary-web and YouTube behavior behind provider-independent adapters without behavior change.
  - Exit: current extraction and ingestion tests pass; direct extraction baseline does not regress.

- [ ] **T204 Separate extraction from analysis**
  - Depends on T203.
  - Persist a source snapshot before starting structured AI analysis.
  - Exit: an analysis failure leaves a valid immutable snapshot available for retry.

## Phase 3 — Apify asynchronous integration

- [ ] **T301 Add Apify environment contract**
  - Depends on a passing candidate from T002, T003, or T004.
  - Add typed optional secrets/config for API token, callback secret, approved Actor IDs/builds, item caps, charge caps, and daily budget.
  - Health output may report configured booleans but never values.
  - Exit: missing or partial configuration fails closed.

- [ ] **T302 Add Apify gateway**
  - Depends on T301.
  - Start pinned Actors asynchronously, persist run IDs, retrieve bounded datasets, and normalize errors.
  - Exit: contract fixtures cover success, timeout, failed run, malformed dataset, and cost-cap rejection.

- [ ] **T303 Add authenticated webhook endpoint**
  - Depends on T302.
  - Add `POST /webhooks/apify` with constant-time header verification, strict body limit/schema, duplicate acknowledgement, and fast enqueue-only behavior.
  - Exit: unauthorized requests fail; duplicate valid callbacks are idempotent; no dataset fetch occurs in the callback.

- [ ] **T304 Add result collection and mapping**
  - Depends on T303.
  - Fetch the bounded dataset after callback, map each result through `provider_run_documents`, and isolate missing/failed inputs.
  - Exit: a ten-input fixture with one failure commits nine snapshots and retries only one document.

- [ ] **T305 Enable one social route behind a flag**
  - Depends on T304 and a passing Actor gate.
  - Prefer Instagram first unless benchmark evidence favors TikTok.
  - Exit: internal canary URLs complete through start, callback, snapshot, analysis, and library projection.

## Phase 4 — Queue and batching

- [ ] **T401 Add Cloudflare Queue bindings and message schema**
  - Define versioned messages containing only internal IDs.
  - Retain scheduled processing as a recovery sweeper.
  - Exit: local and test environments can produce and consume messages without production credentials.

- [ ] **T402 Enqueue after durable capture**
  - Depends on T401.
  - If enqueue fails, leave the D1 job eligible for recovery rather than rolling back the capture.
  - Exit: tests prove capture durability before acknowledgement and recovery after simulated enqueue failure.

- [ ] **T403 Implement idempotent consumers**
  - Depends on T401 and T204.
  - Add message handling for extraction, Apify collection, and snapshot analysis using current-state claims and fences.
  - Exit: redelivery and concurrent consumers cannot duplicate active artifacts or regress terminal state.

- [ ] **T404 Add bounded Apify batching**
  - Depends on T304 and T403.
  - Group compatible work by approved Actor, maximum 20 documents or 10 seconds.
  - Exit: batching reduces Actor starts on the benchmark while preserving per-document outcomes.

- [ ] **T405 Add recovery sweeper**
  - Depends on T402.
  - Re-enqueue durable eligible jobs and recover expired leases without duplicating active Apify runs.
  - Exit: simulated lost queue delivery and expired consumer both recover.

## Phase 5 — Shared public-document reuse

- [ ] **T501 Link new captures to canonical documents**
  - Depends on T102 and T201.
  - Reuse only `public` documents; owner-supplied content remains `owner_only`.
  - Exit: two owners can reference one document while user state remains isolated.

- [ ] **T502 Reuse valid active artifacts**
  - Depends on T501.
  - Skip extraction and analysis when the reusable document has a valid current snapshot and artifact.
  - Exit: a repeated public URL starts zero provider runs.

- [ ] **T503 Add content-hash deduplication**
  - Depends on T202 and T501.
  - Reuse identical extracted public source content without merging distinct captures or aliases.
  - Exit: canonical aliases with identical content do not create duplicate analysis runs.

- [ ] **T504 Backfill legacy rows**
  - Depends on T103 and T501.
  - Backfill documents from canonical URLs and valid legacy artifacts as `legacy-v1`.
  - Do not invent snapshots, evidence, model version, or cost that was not recorded.
  - Exit: owner counts, ordering, URLs, and statuses match pre-backfill snapshots.

- [ ] **T505 Enable shared reuse behind a flag**
  - Depends on T502 and T504.
  - Canary internally and verify no cross-owner fields appear in APIs or logs.
  - Exit: isolation tests and canary observation pass.

## Phase 6 — Evidence-backed analysis

- [ ] **T601 Version the structured analysis schema**
  - Depends on T204.
  - Add evidence block ordinals and optional transcript timestamps while retaining current fields.
  - Exit: strict schema rejects invalid references and oversized outputs.

- [ ] **T602 Update analysis prompt and validation**
  - Depends on T601.
  - Require claims to reference actual source blocks and ignore instructions inside source material.
  - Exit: adversarial fixture and missing-evidence tests pass.

- [ ] **T603 Add client-compatible evidence projection**
  - Depends on T602.
  - Existing clients continue to receive strings; newer views may receive evidence metadata.
  - Exit: build and existing API contract tests pass.

## Phase 7 — Rollout and convergence

- [ ] **T701 Add dashboards or queryable operational summaries**
  - Surface source success, fallback, queue age, duplicate reuse, provider latency, normalized failure, and cost.
  - Exit: all specification success metrics can be measured without raw sensitive payloads.

- [ ] **T702 Add budget and anomaly alerts**
  - Depends on T104 and T701.
  - Enforce 80% warning and 100% fail-closed behavior.
  - Exit: simulated budget exhaustion preserves captures and creates no provider call.

- [ ] **T703 Run full regression and migration verification**
  - Run all tests, source lint, production build, local migrations, backfill dry run, and response-contract comparison.
  - Exit: no unexplained regression remains.

- [ ] **T704 Perform source-by-source canary rollout**
  - Order: selected first social route, second social route, optional web fallback, YouTube transcript fallback.
  - Exit: each route meets its measured acceptance gate before the next is enabled.

- [ ] **T705 Converge implementation against specification**
  - Review every FR and AC against code and evidence.
  - Add missing work to this file rather than declaring success early.
  - Exit: every requirement is implemented, explicitly deferred with rationale, or removed through a specification change.

## Deferred backlog — outside this specification

- [ ] Embeddings and Vectorize integration
- [ ] Semantic search and automatic clusters
- [ ] Recurrence scoring and push notifications
- [ ] Text, image, PDF, and direct-file ingestion
- [ ] Splitting `capture_jobs` into independent `captures` and `processing_jobs`
- [ ] Removing legacy `contents` compatibility storage
