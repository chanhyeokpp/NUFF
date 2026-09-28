# Nuff

대학생·20대 사용자가 유용한 링크를 저장하고, 주제별로 다시 이해하도록 돕는 PKM MVP입니다.

현재 우선순위는 **카카오톡 채널 기반 데이터 수집 파이프라인**입니다. 웹 UI는 보관함 경험을 검토하는 프로토타입입니다.

## 카카오 수집 파이프라인

[최신 카카오 챗봇 기준서·연결·배포 절차](docs/KAKAO-SETUP.md)

[링크·텍스트·이미지·영상·파일 입력 설계](docs/INPUT-MODALITIES.md)

```text
카카오 채널 → 챗봇 스킬 → POST /webhooks/kakao
                                 ↓
                       인증 · 사용자 구분 · URL 정규화
                                 ↓
                       D1 원본 링크/작업 저장
                                 ↓
                       “링크를 보관했어요” 응답

1분 간격 처리기 → 작업 claim → 본문 추출 → AI/발췌 → 결과 저장
                      ↓ 실패
                 지수 백오프 · 재시도 · 실패 상태 보존

사용자가 “보관함” / “요약” 입력 → 사용자별 저장 결과 응답
```

`ingestion/worker.ts`는 웹 UI와 분리해 배포할 수 있습니다. 공개 경로에서도 인증된 카카오 스킬 요청만 처리합니다. Nuff 채널과 `Nuff Bot`, Cloudflare D1/Worker, `Nuff Ingress` 스킬과 폴백 블록을 연결해 운영 버전 `v1.1`로 배포했습니다. 실제 카카오톡에서 보낸 YouTube URL을 Gemini가 직접 분석해 제목·요약·키워드를 D1에 `ready` 상태로 저장하는 전체 경로까지 검증했습니다.

## 로컬 실행

Node 22.13+와 npm이 필요합니다.

```sh
npm ci
npm run dev
npm run test:ingestion
npm run dev:ingestion
```

로컬 ingestion은 `ingestion/.dev.vars`에 테스트용 `KAKAO_SKILL_SECRET`, `KAKAO_BOT_ID`가 필요합니다. 이 파일은 Git에서 제외됩니다. 로컬 DB 마이그레이션:

```sh
npx wrangler d1 migrations apply DB --local --config ingestion/wrangler.jsonc --persist-to .wrangler/ingestion-state
```

`ingestion/wrangler.jsonc`는 생성된 `nuff-ingestion` D1에 연결돼 있습니다. 키는 서버 환경변수에만 저장합니다.

## 코드 구조

- `ingestion/`: 카카오 수신/응답과 durable 작업 큐 처리기
- `lib/pipeline.ts`: 콘텐츠 추출과 교체 가능한 `AIProvider` 인터페이스
- `lib/domain.ts`: 주제 묶음, 키워드 반복률, Enough Signal 휴리스틱
- `app/page.tsx`: 홈, 콘텐츠 추가/상세, 주제 요약, 주간 회고
- `app/api/contents`, `app/api/events`: 웹 저장과 재방문/행동 기록
- `db/schema.ts`, `drizzle/`: SQLite/D1 스키마와 마이그레이션
- `tests/ingestion.test.ts`: 인증, 중복, 사용자 분리, 재시도/lease 검증

## AI와 데이터에 대한 구분

AI 키가 없으면 본문 발췌/규칙 기반 키워드 분류로 표시합니다. 예시 보관함은 실제 저장 데이터와 분리되어 있습니다. Enough Signal은 5건 이상, 분석 콘텐츠의 50% 이상에서 앞선 콘텐츠와 키워드가 60% 이상 겹칠 때 표시합니다. 의미적 유사도나 숙달도를 측정하지는 않습니다.

웹과 카카오 사용자를 합치는 계정 연결은 아직 구현하지 않았습니다. 카카오 보관함은 카카오 명령으로 확인합니다. Instagram/YouTube/TikTok 링크 자체는 수신되지만 영상/로그인 제한 본문을 자동으로 읽지는 않습니다.

## 다음 우선순위

1. 실제 카카오 채널/봇 연결 및 두 계정으로 수신 검증
2. 공개 수신 서버 배포, 운영 실패 모니터링, 사용자 동의/삭제 기능
3. 카카오 사용자 ↔ 웹 보관함 안전한 계정 연결
4. 실제 콘텐츠의 본문/자막 확보율과 AI 분석 정확도 측정
5. 7일 내 재열람률·요약 열람률·선택 행동의 활용 여부 실험

UI 추가 개발보다 1~3번을 우선합니다.
