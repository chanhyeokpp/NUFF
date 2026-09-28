# Nuff repository guidance

Before changing the Kakao channel, chatbot, ingestion endpoint, user identity mapping, notifications, or deployment flow, read `docs/KAKAO-SETUP.md` in full. Treat it as the repository's current Kakao integration decision record and runbook.

For the multi-source public-link ingestion work, also read these files in order before editing code:

1. `specs/001-multisource-ingestion/spec.md` — required behavior and acceptance criteria.
2. `specs/001-multisource-ingestion/plan.md` — target design, migration boundaries, and verification strategy.
3. `specs/001-multisource-ingestion/tasks.md` — dependency-ordered implementation checklist.

Treat the specification as the authority for what to build, the plan as the authority for how to build it, and the task list as execution state. Do not silently widen scope or resolve an open decision in code. Record the decision in the plan first. Mark a task complete only after its stated tests and acceptance criteria pass.

Keep these facts distinct in code and documentation:

- A KakaoTalk Channel relationship webhook does not deliver chat messages. Nuff receives user utterances through a Kakao chatbot Skill.
- The Skill request path must store the original URL and return a valid Kakao response within five seconds. Content extraction and AI analysis run asynchronously.
- Never store or document production secrets. Do not claim that the Worker, D1 database, operating channel, or real-device flow is live until it has been verified.
- When an official Kakao requirement changes, update the verification date, source links, affected decisions, and setup steps in `docs/KAKAO-SETUP.md` in the same change.
