# Instagram link previews

Verified: 2026-09-26. Capture remains URL-first; Instagram video analysis is not implemented.

## Current engine

- Preserve the original stored URL and capture time. For fetching only, convert supported public reel/post paths (including author-prefixed paths) to a canonical `www.instagram.com` URL without share query parameters.
- Fetch public HTML with existing DNS/redirect validation and timeouts. No cookies, Instagram login, private API, or additional AI call is used.
- Parse Open Graph/Twitter title, description and image. Read at most 700 KB, keeping the allowed prefix even when one stream chunk exceeds the limit; for Instagram stop once the document head is complete.
- Decode numeric HTML entities used in captions. Missing image metadata must not accidentally become the page URL; reject credentialed/private-IP image URLs.
- Generic login/error pages fall back to `인스타그램 릴스`, `인스타그램 게시물`, or `인스타그램 영상`, without the Instagram login page's promotional text or logo.
- The authenticated library also applies title fallback to older records. The web inbox renders reel/video fallbacks with its video card treatment. AI results remain separate.

## Actual verification and limitation

The user's reported public reel returned HTTP 200 with a real title and image from the development Mac. After deploying Worker version `23331757-b37f-481c-83d8-7435fdece912`, its existing failed-preview record was requeued once. Cloudflare still returned no usable metadata: the stored result is `인스타그램 릴스`, no thumbnail, and `needs_content`. The original URL and save time were preserved; the corrected fallback was visibly verified in `/space`.

This does **not** establish universal Instagram preview support. The exact remote HTTP/login response is not persisted, so do not claim a particular blocking reason. No copied local metadata was inserted to disguise the remote extraction limitation.

The current iOS extension sends a URL only. Forwarding share-provided titles/images would require a separately tested payload/storage change and an updated phone build; it is not part of this change. A different extraction provider would need reliability, privacy and cost evaluation before adoption.

Validation: 32 ingestion/auth/live-sync/preview tests passed; TypeScript, scoped ESLint and production web build passed. Existing one-record reprocessing made no AI request for Instagram.
