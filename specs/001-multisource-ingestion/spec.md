# Specification: Multi-source public-link ingestion

Status: ready for planning and staged implementation  
Created: 2026-09-28  
Target scale: 1,000 monthly active users, where an active user saved or reopened at least one item in the last 30 days

## Authority and reading order

This specification defines what the feature must do. It does not replace source-specific operating records.

1. Repository-wide invariants: `AGENTS.md`
2. Kakao requirements and verified operational state: `docs/KAKAO-SETUP.md`
3. Product input boundaries: `docs/INPUT-MODALITIES.md`
4. This specification
5. Technical implementation: `plan.md`
6. Execution state: `tasks.md`

If these documents conflict, stop implementation and update the lower-authority document. Do not reinterpret the Kakao five-second requirement or claim a production integration is live without verification.

## Problem

Nuff durably stores public links and can analyze ordinary web pages and public YouTube videos. The current pipeline has four material limitations:

- Instagram and TikTok usually produce only a preview or `needs_content` result.
- extraction behavior is embedded in one pipeline rather than represented by replaceable providers;
- the same public URL can be extracted and analyzed again for different owners;
- processing latency, provider usage, failure cause, and per-item cost are not measured consistently.

The next implementation must improve source coverage without moving slow work into the request path or turning Make, Google Sheets, Apify, or any single model into the system of record.

## Product outcome

When a user sends a supported public URL, Nuff must:

1. store the user's capture before acknowledging it;
2. respond without waiting for extraction or AI analysis;
3. route the URL to the cheapest suitable extractor;
4. reuse a prior public-document result when safe;
5. preserve source evidence and provider provenance;
6. show an honest pending, ready, needs-content, or failed state;
7. retain the original URL even when every downstream provider fails.

## Definitions

- **Capture**: a user's act of saving a URL. It is owner-scoped and may contain user-specific state.
- **Document**: a normalized representation of a publicly accessible source URL. It may be reused across captures.
- **Snapshot**: immutable extracted source material plus location evidence such as a page locator or video timestamp.
- **Artifact**: a versioned AI-derived result generated from one snapshot.
- **Provider run**: one direct, Gemini, Apify, or future provider attempt with timing, status, and usage metadata.
- **Public reuse**: sharing extraction and analysis results for a URL that is public and contains no user-supplied private material. It never shares ownership, notes, viewing state, or authentication data.

## Goals

- Keep Kakao and app ingestion fast and durable.
- Add measurable extraction paths for Instagram and TikTok public URLs.
- Keep direct extraction as the default for ordinary web pages.
- Keep Gemini direct video understanding as the primary YouTube path.
- Use Apify selectively for social extraction and extraction fallbacks.
- Avoid duplicate provider calls for the same unchanged public content.
- Make provider choice, cost, latency, and failure visible in stored telemetry.
- Produce evidence-backed structured analysis that can later support search and embeddings.

## Non-goals

- Bulk keyword harvesting, trend monitoring, or competitor research.
- Make.com or Google Sheets as production orchestration or storage.
- Private, logged-in, age-restricted, close-friends, or paywalled content bypass.
- Downloading or redistributing complete copyrighted media.
- A self-hosted crawler, LLM, speech model, or vector database.
- Semantic search, automatic clustering, recommendation, or push notification delivery in this feature.
- Moving the existing operating Kakao callback into another service.

## Functional requirements

### FR-001 — Durable intake

Every accepted link must be stored in D1 before the channel-specific success response is returned. Extraction, Apify, Gemini, LLM analysis, and embedding work must not run on the Kakao request path.

### FR-002 — User-visible identity and isolation

Captures, viewing state, notes, pins, and source-channel metadata remain owner-scoped. A user can never discover another user's capture through shared-document reuse.

### FR-003 — Canonicalization and exact deduplication

Tracking parameters and fragments must be removed using the existing URL policy. The same owner and canonical URL must not create duplicate captures. Public-document reuse must key on canonical URL and, where available, a verified platform content ID.

### FR-004 — Platform routing

The router must classify at least:

- ordinary web;
- YouTube and YouTube Shorts;
- Instagram posts and Reels;
- TikTok public videos;
- unsupported public HTTP(S) links.

Classification must use parsed host and path rules, not substring matching.

### FR-005 — Ordinary web policy

Nuff must try its direct safe HTML extractor first. Apify may run only when the direct result is unreadable, blocked, or below the documented content threshold. An Apify failure must degrade to preserved metadata and an explicit state.

### FR-006 — YouTube policy

Gemini direct video analysis remains the primary path when configured. Apify transcript extraction is a fallback for a video-unavailable result, not for authentication failure or exhausted budget. Official metadata remains the final fallback.

### FR-007 — Instagram and TikTok policy

For a public Instagram or TikTok URL, Nuff may use an approved Apify Actor to retrieve public metadata, caption text, or an available transcript. Actor selection is blocked until it passes the evaluation gate in this specification. Unavailable media must not be bypassed with user cookies or stored login sessions.

### FR-008 — Asynchronous Apify runs

Nuff must start Apify runs asynchronously, persist the external run ID, and continue through an authenticated completion webhook or a bounded recovery poll. The ingestion handler must never wait synchronously for an Actor to finish.

### FR-009 — Batching

Apify inputs may be grouped only by provider, Actor, and compatible input schema. Initial limits are 20 URLs or 10 seconds, whichever happens first. Each result must map back to exactly one internal document. A batch failure must permit per-document retry.

### FR-010 — Normalized source document

Every successful extractor must return the same logical contract:

```ts
type SourceDocument = {
  sourceType: 'web' | 'video' | 'social';
  platform: string;
  canonicalUrl: string;
  platformContentId?: string;
  title: string;
  author?: string;
  publishedAt?: string;
  thumbnail?: string;
  blocks: Array<{
    kind: 'heading' | 'paragraph' | 'caption' | 'transcript';
    text: string;
    startSec?: number;
    endSec?: number;
    locator?: string;
  }>;
};
```

Provider-specific output must not escape past its adapter.

### FR-011 — Evidence-backed analysis

Structured analysis must retain evidence references for claims when source blocks exist. The analysis must store provider, model, prompt version, snapshot ID, input/output token counts when available, and generation time. AI processing must never overwrite user-authored fields.

### FR-012 — State model

The system must distinguish at least:

`queued`, `processing`, `waiting_provider`, `analyzing`, `ready`, `needs_content`, `retry`, and `failed`.

State changes must be fenced so a stale worker or duplicate webhook cannot overwrite a newer successful result.

### FR-013 — Retry and fallback

Transient provider failures must retry with bounded exponential backoff. Permanent access or unsupported-content failures must move to `needs_content`. Retry exhaustion must move to `failed` while preserving the capture and original URL.

### FR-014 — Provider observability

Each provider attempt must record provider, operation, external run ID when applicable, start/end time, outcome, normalized error code, input/result count, and known or estimated cost. Logs must not contain secrets, raw identity keys, private pasted text, or full transcripts.

### FR-015 — Spend control

Apify calls must set the tightest supported item and charge ceilings. A configurable daily provider budget must fail closed: new expensive work remains queued or becomes `needs_content`; durable captures are never rejected solely because the extraction budget is exhausted.

### FR-016 — Compatibility

Existing Kakao, iOS, and web clients must continue to read their current response shapes during migration. Existing `contents.data` rows remain readable until a verified backfill and read cutover are complete.

## Acceptance scenarios

### AC-001 — Request path remains fast

Given an authenticated Kakao request containing a valid URL, when Nuff accepts it, then D1 contains the capture before a valid Kakao response is returned and no extraction provider was awaited.

### AC-002 — Shared public analysis

Given two different owners saving the same unchanged public URL, when the first document is already ready, then the second owner receives a separate capture referencing the existing document and no new extraction or LLM run is started.

### AC-003 — Private data is not reused

Given a capture containing user-pasted text or another non-public source, when another user saves the same URL, then the first user's source material, analysis, and notes are not reused.

### AC-004 — Web fallback

Given a public article that the direct extractor cannot read, when an approved Apify fallback succeeds, then a normalized snapshot and analysis are stored with Apify provenance.

### AC-005 — YouTube fallback

Given a public YouTube URL that Gemini reports as video-unavailable, when an approved transcript Actor returns captions, then Nuff analyzes the captions and records that the result is transcript-based rather than direct-video-based.

### AC-006 — Social failure is honest

Given an inaccessible Instagram or TikTok URL, when the Actor reports private, removed, restricted, or unsupported content, then Nuff preserves the URL, stores the normalized failure reason, and does not claim to have analyzed the content.

### AC-007 — Duplicate webhook safety

Given the same Apify completion webhook delivered more than once, when Nuff processes it, then at most one snapshot and one active artifact version are committed and the provider run remains internally consistent.

### AC-008 — Batch isolation

Given a batch with one failed URL and nine successful URLs, when results arrive, then the nine successes become analyzable and only the failed document enters retry or needs-content.

### AC-009 — Budget exhaustion

Given the configured provider budget is exhausted, when a new social URL is captured, then the original link is stored and visible while no unbounded provider charge is created.

## Actor evaluation gate

No community Actor may enter the production route until a fixed public test corpus has been run at least twice on different days and the result is recorded. Each candidate must report:

- owner and maintenance status;
- immutable Actor/build identifier or pinned version;
- input and output schema;
- public-URL metadata success rate;
- transcript success rate on content known to contain speech;
- explicit-failure classification rate;
- p50 and p95 duration;
- cost per attempted and successful item;
- duplicate, malformed, and missing-result behavior;
- public-content and retention terms.

The default gate is at least 90% metadata success, at least 95% explicit result-or-reason coverage, zero cross-input result ambiguity, and a measured cost inside the configured product budget. Transcript yield is reported separately because captions may not exist.

## Success metrics

- Intake durability: 99.9% or better for accepted requests.
- Ordinary-web readable result: at least the current baseline; no regression is accepted.
- Result honesty: 100% of inaccessible-content cases avoid a fabricated summary.
- Queue age: p95 below three minutes under the target test workload.
- Duplicate savings: repeated public URLs start zero additional extraction/analysis runs after a valid reusable result exists.
- Observability: at least 99% of provider attempts have a terminal run record and normalized outcome.
- Cost: measurable per successful ready document and enforceable by daily budget.

## Open decisions that block only their dependent tasks

- Exact Instagram Actor and pinned build.
- Exact TikTok Actor and pinned build.
- Exact YouTube transcript fallback Actor.
- Whether Apify ordinary-web fallback beats the current extractor on the evaluation corpus.
- Initial daily Apify dollar budget.
- Retention period for extracted public snapshots and provider payloads.

These decisions must be recorded in `plan.md` after evidence exists. They must not be guessed during implementation.
