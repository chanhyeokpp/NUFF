# Message-first archive prototype

Route: `/space?demo=1&view=timeline` (entry preview: `/space?demo=1`). This is a local-state
design prototype, separate from the live inbox at `/space`. Reloading resets messages,
edits, favorites, trash, and attachments. No API requests or identity changes
are introduced by demo mode. File object URLs stay in the browser and are
released on unmount; the attachment limit is one file of at most 10 MB per message.

## Layout decisions

### Selected NUFF neon design (2026-09-26)

The user selected the neon direction. `/space` now always uses the near-black,
orange and lavender theme; the A/B studio strip and solid variant have been removed.
Old `design=solid` or `design=neon` links still open the same selected design.
Workspace/login height and date-drawer offset once again account only for the
32 px top bar.

Two low-opacity radial-gradient layers behind the workspace drift via CSS transform
animations (28 and 37 seconds, alternating ease-in-out). They never move content or
intercept input. The existing workspace overflow clips the oversized layers.
`prefers-reduced-motion: reduce` removes both animations and compositor hints.

### Account and channel settings (2026-09-26)

The inbox's account links and archive-drawer link now point to `/space/settings`,
not the legacy dashboard at `/`. The new screen reuses the selected neon styles
and animated background, with direct links back to `/space`. It reads `/auth/me`
using the existing device token and displays the actual email and Kakao provider
status. A missing provider is not inferred while the request is loading or failed.
Existing `/auth/link-kakao` and `/auth/add-email` actions are exposed only when
needed; the Kakao form explains that existing channel records are merged.
Logout clears this browser's token. No server identity or pairing contract changed.
The existing login component can show signup and email verification here as well,
so the signed-out path no longer sends the user to the old dashboard.

Verified the actual inbox → settings navigation, current account and connected
Kakao status, and neon styling in the browser. TypeScript, scoped lint and build
passed. No real account creation, linking, or logout was performed for this UI check.

- Remove the oversized date heading, decorative copy, count badges, vertical
  timeline line, warm brown palette, always-visible edit controls, and large editor.
- Keep quick capture, chronological ordering, inline edits, replies, date access,
  search, and favorites. Date navigation moves into an on-demand archive drawer.
- Hierarchy: message content → compact preview/quote → timestamp/source metadata.
  Header and composer remain available while only the message stream scrolls.

```text
Menu   나에게 보내기                        Today / Favorites / Search
─────────────────────────────────────────────────────────────────────
                            date separator
                                            text message
                                                    time
                                   note + compact link preview
                                                    time
                                   quoted original + reply
                                                    time
─────────────────────────────────────────────────────────────────────
+   message or link…                                           send
```

Neutral background and system sans serif; yellow is reserved for selected
states and sending. The stream is at most 840 px wide. Short messages are compact;
long notes expand. Links use a stacked landscape thumbnail and compact title/source
card, up to 320 px wide (300 px on mobile). Images and files use separate
attachment presentations within the same stream. No avatars or read receipts.

## Interactions

- Enter sends; Shift+Enter inserts a newline. IME composition/229 never sends.
- Composer grows from one line to six. Drafts survive date/filter changes.
- Hover/focus shows Reply, Edit, More; touch keeps More available. Right-click
  opens the same menu. Inline edits save with Cmd/Ctrl+Enter; Escape cancels.
- Replies reference a stable message ID. Edited originals update quotes;
  deleted originals display a placeholder and cannot be jumped to.
- Delete is soft deletion with Undo and a restore action in Trash.
- Cmd/Ctrl+K searches all nondeleted sample messages, including link metadata
  and attachment filenames; selecting a result jumps to its original position.
- Favorites, links, attachments, and date filtering are available from navigation.

## Implementation boundaries

### Live inbox (2026-09-26)

`/space` now uses the same existing `nuffDeviceToken` as the web account at `/`.
It verifies `/auth/me`, then fetches the authenticated `/captures` endpoint from
the existing ingestion Worker. While visible, it checks every 3 seconds; focus,
reconnection, and returning from a hidden tab also refresh the list. This is
polling, not WebSocket/server push. The existing API returns the latest 200 captures.

Queued/processing items appear before analysis completes. URL plus authenticated
owner forms a stable UI key because job and analyzed-content IDs can differ.
The first observed timestamp is retained during the session to avoid moving a
message as analysis updates it. Existing records can carry the analysis creation
timestamp in the current API; a future server contract should always return the
capture creation timestamp for exact historical ordering.

New arrivals follow the bottom when the reader is there. When reading older
messages, the viewport stays put and a new-record button appears. Connection
errors keep the last good snapshot and show reconnection state. Logout, token
replacement, and 401 responses clear private data; stale responses are ignored.
No sample records are mixed into the live inbox.

Live composer supports a single link via the existing `/captures/shortcut` API.
Text/file uploads, replies, edits, favorites, and deletion remain **demo only**
until corresponding authenticated server mutations exist. Live records expose
copy and open-source actions only. No Worker deployment or schema change was
required for this connection.

Verified: existing authenticated captures render in `/space`; mocked transport
tests cover arrival/status refresh, account switching, stale responses, 401,
offline recovery, and overlapping requests. On 2026-09-26 the user confirmed a new
phone capture appeared automatically while the page was open; the new record and
its subsequently completed analysis were also visible in browser verification.

### Preview and analysis separation (2026-09-26)

- The inbox displays thumbnail, original title, publisher when available, source,
  and time. A link-only message does not repeat its raw URL above the card.
- AI summaries, claims, tags, pending states, and failures live exclusively in the
  separate Analysis view. Both views consume the same authenticated polling snapshot;
  changing tabs does not submit a new AI request. “보관함에서 보기” jumps to the record.
- `Message.analysis` holds the existing API's summary/claims/keywords/mode;
  `Message.link.summary` is empty for live captures so errors cannot become previews.
- Public YouTube titles/authors come from oEmbed through `/api/link-preview?video=…`.
  The route accepts only an 11-character video ID, fetches a fixed YouTube endpoint,
  rejects redirects using `manual` (Workers does not support `redirect: error`), and
  returns only validated plain-text metadata. No API key or AI call is involved.
  Bounded server/browser caches deduplicate lookups; timeouts and unavailable videos
  fall back to saved titles and a known thumbnail URL, then an icon on image failure.
  Non-YouTube links use existing stored preview metadata; no arbitrary URL fetch was added.
- Preview enrichment is display-only, not persisted to D1. Search still uses stored
  titles/URLs, so newly fetched original titles are not yet indexed for search.
- The older “영상 분석 API가 응답하지 않았어요” message maps to `gemini_video_failed`,
  covering both unclassified non-OK responses and missing output text. Historical
  records do not retain enough detail to distinguish those causes. Other records
  explicitly indicate rate limiting; the newly received video completed analysis.

Validation: 18 message/sync/preview tests, TypeScript, scoped ESLint, and production
build passed. Browser checks confirmed real YouTube titles/thumbnails, inbox without
analysis text, and the Analysis view showing stored summaries and older errors.

`message-model.ts` owns the reducer and relationships. List, bubble, menus,
composer, reply, link, attachment, and search components are separated.
The server passes one date snapshot to avoid server/client hydration mismatch.

Local reducer updates are synchronous. Real optimistic API requests, rollback,
pagination/virtualization, durable uploads, tags, and full-text indexing are not
implemented here. The preview owner field is not a security boundary.

Validation: `tests/space-messages.test.ts` covers reply lifecycle, duplicate and
invalid parent rejection, trash restoration, source preservation, IME behavior,
Seoul date boundaries, and attachment-only messages. Browser checks cover sending,
reply/edit menus, search jumps, favorites, date navigation, and desktop/mobile layout.
