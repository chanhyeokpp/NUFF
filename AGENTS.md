# Nuff repository guidance

Before changing the Kakao channel, chatbot, ingestion endpoint, user identity mapping, notifications, or deployment flow, read `docs/KAKAO-SETUP.md` in full. Treat it as the repository's current Kakao integration decision record and runbook.

For the multi-source public-link ingestion work, also read these files in order before editing code:

1. `specs/001-multisource-ingestion/spec.md` — required behavior and acceptance criteria.
2. `specs/001-multisource-ingestion/plan.md` — target design, migration boundaries, and verification strategy.
3. `specs/001-multisource-ingestion/tasks.md` — dependency-ordered implementation checklist.

Treat the specification as the authority for what to build, the plan as the authority for how to build it, and the task list as execution state. Do not silently widen scope or resolve an open decision in code. Record the decision in the plan first. Mark a task complete only after its stated tests and acceptance criteria pass.

Use the 12-stage delivery roadmap at the top of `tasks.md` as the user-facing unit of progress. When implementation is requested:

- At the start of every stage, send a short update in this exact shape: `Nuff 개발 X/12단계 — <단계명> 시작 · 예상 <활성 작업 시간>`.
- A time estimate means active agent work, not guaranteed wall-clock completion. Mention external waiting separately.
- Keep working through the detailed task IDs assigned to that stage. Do not ask for routine implementation choices; choose the safest reversible option that follows the specification.
- At stage completion, update the checklist, run the stage verification, and report: `X/12단계 완료 — <검증 결과>. 다음은 Y/12단계 — <단계명> · 예상 <시간>, 시작합니다.` Then continue when the user's instruction covers multiple stages.
- Pause only for a real boundary: a production secret, paid provider choice, destructive or irreversible action, production deployment, or external console/real-device verification that cannot be completed safely without the user.
- If work stops mid-stage, report the current stage, completed task IDs, remaining task IDs, and the next concrete action. Never imply that the stage is complete.

Keep these facts distinct in code and documentation:

- A KakaoTalk Channel relationship webhook does not deliver chat messages. Nuff receives user utterances through a Kakao chatbot Skill.
- The Skill request path must store the original URL and return a valid Kakao response within five seconds. Content extraction and AI analysis run asynchronously.
- Never store or document production secrets. Do not claim that the Worker, D1 database, operating channel, or real-device flow is live until it has been verified.
- When an official Kakao requirement changes, update the verification date, source links, affected decisions, and setup steps in `docs/KAKAO-SETUP.md` in the same change.
