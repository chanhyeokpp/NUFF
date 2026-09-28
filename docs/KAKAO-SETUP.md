# Nuff 카카오톡 챗봇 기준서

> 이 파일은 Nuff의 카카오톡 수집 기능을 수정하는 사람과 AI가 먼저 읽는 기준 문서다.  
> 마지막 공식 문서 확인: **2026-09-24**  
> 현재 상태: **Nuff 채널과 `Nuff Bot` 생성, 운영 채널 연결, Cloudflare D1/Worker 배포, `Nuff Ingress` 스킬 저장, 폴백 블록 연결과 운영 버전 `v1.1` 전체 배포까지 완료됨. 실제 카카오톡에서 보낸 YouTube URL을 Gemini가 직접 분석해 제목·요약·키워드를 D1에 `ready` 상태로 저장하는 전체 경로까지 검증함.**

## 1. 결론

Nuff의 핵심 수집 경로는 현재 카카오에서 지원하는 정식 구조로 구현할 수 있다.

```text
사용자
  └─ Nuff 카카오톡 채널에 URL 전송
       └─ 카카오 챗봇의 블록 실행
            └─ 카카오가 Nuff 스킬 서버에 HTTPS POST
                 ├─ URL과 사용자 구분키 검증
                 ├─ 원본 URL과 처리 작업을 DB에 먼저 저장
                 └─ 5초 안에 "보관했어요" 응답
                      └─ 백그라운드 처리기
                           ├─ 본문/메타데이터 추출
                           ├─ 요약·태그·핵심 생성
                           └─ 사용자별 보관함에 결과 저장
```

카카오톡 **채널 관계 웹훅**은 친구 추가·차단 이벤트용이다. 채팅 내용을 받는 기능이 아니다. 사용자가 채널 채팅방에 보낸 문장을 받으려면 **챗봇 스킬**을 사용해야 한다.

Nuff는 사용자의 다른 카카오톡 대화나 전체 대화 목록을 읽지 않는다. 사용자가 Nuff Bot에 직접 보낸 발화만 카카오가 해당 블록의 스킬 서버로 전달한다.

## 2. 현재 MVP의 제품 동작

| 사용자 입력 | Nuff 동작 | 즉시 응답 |
|---|---|---|
| URL 1~5개 | 정규화 후 사용자별 원본과 작업 저장 | 저장 개수와 중복 개수 안내 |
| `보관함`, `내 링크` | 최근 링크 5개 조회 | 링크와 처리 상태 표시 |
| `요약` | 최근 결과 5개 조회 | 완료된 요약과 링크 표시 |
| `다시 시도` | 실패 작업을 다시 큐에 넣음 | 재처리 여부 안내 |
| 링크 없는 문장 | 저장하지 않음 | 사용법 안내 |

현재 서버 구현은 [ingestion/kakao.ts](../ingestion/kakao.ts)에 있다. 응답은 `SimpleText`를 사용하며 공식 제한인 1,000자에 맞춰 자른다.

## 3. 카카오 관리자센터의 개념과 Nuff에서의 용도

| 메뉴/개념 | 카카오의 역할 | Nuff에서 지금 할 일 |
|---|---|---|
| 시나리오 | 여러 블록을 묶는 단위 | 기본 시나리오만 사용 |
| 블록 | 하나의 사용자 의도와 실행·응답 단위 | 웰컴, 폴백, 명령 블록 구성 |
| 웰컴 블록 | 사용자가 처음 채팅방에 들어올 때 최초 1회 응답 | Nuff 사용법과 데이터 처리 안내 |
| 폴백 블록 | 다른 블록과 매칭되지 않은 발화를 처리 | 임의의 URL을 수신 스킬로 전달 |
| 탈출 블록 | 되묻기 상태에서 대화 초기화 | MVP에서는 기본값 유지 |
| 스킬 | 카카오가 외부 HTTPS 서버를 호출하는 연결 | `Nuff Ingress` 등록 |
| 학습 | 매칭되지 않은 운영 발화를 기존 블록에 연결 | URL 수집 MVP에는 우선순위 낮음 |
| 분석 | 운영 채널의 블록 호출·사용 현황 | 파일럿 이후 지표 확인 |
| 배포 | 저장된 변경을 실제 운영 데이터에 반영 | 최초 전체 배포, 이후 블록+스킬 동시 배포 |
| 작업이력 | 관리자 변경 이력 | 문제 발생 시 변경자와 시점 확인 |
| 머신러닝 | 발화 유사도로 의도를 분류 | URL 수집에는 사용하지 않아도 됨 |
| 관리자 | 공동 작업자와 권한 관리 | 팀원이 생길 때 최소 권한 부여 |
| 설정 | 봇 이름, ID, 운영/개발 채널, 앱키, AI 챗봇 등 | 채널 연결과 봇 ID 확인 |
| 봇테스트 | 배포 전 웹에서 발화·응답·스킬 JSON 확인 | `Ctrl+E`로 모든 필수 케이스 검증 |

Nuff는 자연어 의도 분류보다 **명시적 명령 블록 + 모든 나머지를 받는 폴백 블록**이 적합하다. URL 형식을 카카오 NLU에 학습시키지 않고 서버가 `userRequest.utterance`에서 URL을 직접 추출한다.

## 4. 지금 화면에서 진행할 정확한 순서

`Nuff Bot`은 최초 배포 후 실행 상태이며 Nuff 운영 채널과 연결됐다. 실제 카카오톡에서 웰컴·폴백 응답도 확인했다. 완료된 항목은 향후 재설정할 때 참고할 수 있도록 남긴다.

### A. 첫 배포와 채널 연결

- [x] **웰컴 블록**을 누르고 우측 상단 `미사용/OFF`를 `사용 중/ON`으로 바꾼다.
- [x] 텍스트 응답을 아래처럼 저장한다.

```text
안녕하세요, Nuff예요 👋
기억하고 싶은 콘텐츠의 링크를 이 채팅방에 보내주세요.
원본 링크를 먼저 안전하게 보관하고, 읽을 수 있는 내용은 요약·태그로 정리해드려요.

보관함 · 최근 링크 보기
요약 · 정리된 내용 보기
다시 시도 · 실패한 링크 다시 처리
```

- [x] **폴백 블록**에 임시 텍스트 응답을 저장한다: `링크를 보내주시면 Nuff가 보관해드려요.`
- [x] 상단 **배포** → **전체 배포** → 배포 내용 `Nuff 최초 채널 연결용 v1` → 배포한다. 최초 버전은 `v1.0`이다.
- [x] 배포가 끝나면 **설정** → **기본 정보/카카오톡 채널 연결** → **운영 채널**에서 `Nuff`를 선택한다.
- [x] 실제 카카오톡 채팅방에서 웰컴 메시지와 폴백 메시지를 확인한다.
- [ ] 연결할 채널이 보이지 않으면 현재 계정이 채널 매니저 이상인지, 봇 마스터인지, 채널이 다른 봇에 이미 연결되지 않았는지 확인한다.

개발 채널은 선택 사항이다. 초기 1인 실험은 봇테스트와 운영 채널로 시작할 수 있다. 개인정보 플러그인, 카카오싱크, Event API 등 비즈앱 연동 기능을 사용할 때는 비즈니스 인증 채널·앱과 개발 채널 요건을 별도로 맞춘다.

### B. 공개 스킬 서버 준비

카카오 스킬은 로컬 주소를 호출하지 않는다. 공인 IP 또는 공중망 HTTPS 도메인이 필요하고 5초 안에 응답해야 한다. Nuff는 Cloudflare Worker를 스킬 서버로 사용한다.

```sh
npx wrangler login
npx wrangler d1 create nuff-ingestion
# 반환된 database_id를 ingestion/wrangler.jsonc에 입력
npx wrangler d1 migrations apply DB --remote --config ingestion/wrangler.jsonc
npx wrangler secret put KAKAO_SKILL_SECRET --config ingestion/wrangler.jsonc
npx wrangler secret put KAKAO_BOT_ID --config ingestion/wrangler.jsonc
# 일반 웹 문서 AI 분석을 켤 때만
npx wrangler secret put OPENAI_API_KEY --config ingestion/wrangler.jsonc
# YouTube 영상 직접 분석을 켤 때
npx wrangler secret put GEMINI_API_KEY --config ingestion/wrangler.jsonc
npx wrangler deploy --config ingestion/wrangler.jsonc
```

비밀값을 소스, 문서, URL, 카카오 대화에 적지 않는다. `KAKAO_BOT_ID`는 **설정 → 기본 정보**에서 확인한 실제 봇 ID다. [ingestion/wrangler.jsonc](../ingestion/wrangler.jsonc)의 `database_id`는 생성된 `nuff-ingestion` D1 데이터베이스에 연결돼 있다.

배포 후 확인:

```sh
curl https://<worker-domain>/health
```

`configured: true`여야 한다. `/webhooks/kakao`는 올바른 비밀 헤더와 봇 ID가 없으면 거부되어야 한다.

현재 배포 주소:

```text
https://nuff-kakao-ingress.cksrowldms9-475.workers.dev
```

2026-09-24 기준 `/health`에서 `configured: true`를 확인했다. 운영 스킬 URL은 위 주소에 `/webhooks/kakao`를 붙인 값이다.

### C. 스킬 생성

- [x] 좌측 **스킬** → **생성/스킬 만들기**.
- [x] 스킬명: `Nuff Ingress`.
- [x] URL: `https://<worker-domain>/webhooks/kakao`.
- [x] Test URL: 초기에는 같은 공개 URL을 입력한다. 개발 서버를 분리하면 개발 URL로 바꾼다.
- [x] `헤더값 입력`과 `테스트 헤더값 입력`에 아래 값을 각각 넣는다.

```text
키: x-nuff-skill-key
값: KAKAO_SKILL_SECRET에 저장한 값
```

- [x] 저장한 뒤 **스킬 테스트**에서 요청 JSON을 확인하고 서버 전송을 실행한다.
- [x] 응답 미리보기와 결과 로그에서 HTTP 성공 및 `version: "2.0"` 응답을 확인한다.

2026-09-24 스킬 테스트에서 `https://example.com/nuff-test`를 전송해 즉시 저장 응답을 받았다. D1 작업은 `queued`에서 예약 처리 후 `needs_content`로 전환되어 수신과 비동기 처리 경로가 모두 동작함을 확인했다.

### D. 폴백과 명령 블록에 스킬 연결

- [x] **기본 시나리오 → 폴백 블록**을 연다.
- [x] `파라미터 설정`을 펼치고 스킬 목록에서 `Nuff Ingress` 최신 버전을 선택한다.
- [x] `봇 응답 형식 설정`에서 **스킬 데이터로 사용**을 선택한다.
- [x] 임시 텍스트 응답은 제거한다. 스킬 자체가 완성된 말풍선 JSON을 반환한다.
- [ ] 일반 블록 `보관함`, `요약`, `다시 시도`를 각각 만든다.
- [ ] 각 블록의 예상 발화에 해당 문구를 등록하고 같은 `Nuff Ingress` 스킬 및 **스킬 데이터로 사용**을 연결한다.

명령 블록을 따로 만드는 이유는 학습·분석 화면에서 사용 의도를 구분하기 위해서다. 서버는 폴백과 세 명령 블록 모두에서 같은 `utterance`를 처리한다.

### E. 테스트와 운영 반영

- [x] 스킬 자체 테스트에서 URL 저장 응답과 D1 기록을 확인한다.
- [ ] 우측 **봇테스트** 또는 `Ctrl+E`를 열어 블록 단위 시험을 실행한다.
- [ ] 아래 시험표를 전부 실행한다.
- [ ] 봇테스트 상세 정보에서 **블록명, 스킬명, Request, 스킬응답, 응답오류**를 확인한다.
- [x] `Nuff Ingress`와 폴백 변경을 운영 버전 `v1.1`로 전체 배포한다.
- [x] 실제 카카오톡 Nuff 채널에서 URL을 보내 D1 저장과 예약 처리를 확인한다.

스킬 URL·헤더·버전이 바뀌면 **스킬 자체를 배포**해야 한다. 블록이 참조하는 스킬이나 응답 설정이 바뀌면 **해당 블록도 배포**해야 한다.

## 5. 카카오 스킬 요청 규격

카카오는 블록 실행 시 스킬 서버로 JSON을 `POST`한다. Nuff가 실제로 사용하는 최소 필드는 다음과 같다.

```json
{
  "userRequest": {
    "timezone": "Asia/Seoul",
    "block": {
      "id": "<block-id>",
      "name": "폴백 블록"
    },
    "utterance": "https://example.com/article",
    "lang": "ko",
    "user": {
      "id": "<botUserKey>",
      "type": "botUserKey",
      "properties": {
        "plusfriendUserKey": "<channel-user-key>",
        "isFriend": true
      }
    }
  },
  "bot": {
    "id": "<bot-id>",
    "name": "Nuff Bot"
  },
  "action": {
    "id": "<skill-id>",
    "name": "Nuff Ingress",
    "params": {},
    "detailParams": {},
    "clientExtra": null
  }
}
```

주요 필드:

- `userRequest.utterance`: 사용자가 Nuff Bot에 보낸 현재 발화.
- `userRequest.user.id`: 현재는 `botUserKey`. 한 봇 안에서 사용자를 구분하며 최대 70자다. 같은 사용자라도 봇이 달라지면 값이 달라진다.
- `userRequest.user.properties.plusfriendUserKey`: 채널 기준 비식별 사용자 구분키.
- `userRequest.user.properties.appUserId`: 봇에 앱키를 정상 설정한 경우에만 제공될 수 있으며 카카오 로그인 사용자와 연결할 때 사용한다.
- `userRequest.user.properties.isFriend`: 채널 친구이면 `true`; 친구가 아니거나 차단했으면 필드가 없을 수 있다.
- `bot.id`: 요청이 Nuff Bot에서 왔는지 서버가 검증하는 값.
- `X-Request-Id`: 카카오가 HTTP 헤더로 제공하는 대화 요청 식별자. 장애 추적 로그에 남길 수 있으나 현재 코드는 저장하지 않는다.

Nuff는 원본 `botUserKey`를 DB에 저장하지 않는다. `SHA-256(bot.id + NUL + user.id)`를 계산한 내부 소유자 키만 저장한다. 웹 계정과 카카오 계정을 합치려면 향후 명시적 계정 연결 절차를 추가해야 한다.

## 6. Nuff 스킬 응답 규격

현재 구현의 기본 응답은 다음 형식이다.

```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "링크 1개를 보관했어요.\n읽을 수 있는 내용은 차례대로 정리할게요."
        }
      }
    ]
  }
}
```

- `SimpleText.text`는 최대 1,000자다.
- 500자를 넘으면 카카오톡에서 이후 내용이 생략되고 `전체 보기` 버튼으로 확인한다.
- 한 블록은 최대 3개의 연속 응답을 설정할 수 있다.
- 전체 응답이 30,720 bytes를 넘으면 정상 발송되지 않을 수 있으므로 봇테스트의 응답 크기를 확인한다.
- 스킬 데이터 응답의 형식 오류와 크기 초과는 **스킬 → 오류 내역**에서 확인한다.

## 7. 5초 제한과 비동기 처리

카카오의 일반 스킬 타임아웃은 고정이며 서버는 5초 안에 응답해야 한다. 따라서 수신 요청 안에서 웹페이지 추출, 영상 자막 수집, LLM 요약을 끝내려 하면 안 된다.

Nuff의 처리 원칙:

1. 요청과 인증을 검증한다.
2. URL과 작업을 DB에 먼저 저장한다.
3. 즉시 저장 확인 응답을 보낸다.
4. 별도 예약 작업이 콘텐츠를 분석한다.
5. 사용자가 `보관함` 또는 `요약`을 보내 결과를 조회한다.

### 완료 알림 선택지

| 방식 | 성격 | 조건/제약 | MVP 결정 |
|---|---|---|---|
| 사용자가 `요약` 입력 | 사용자가 다시 조회 | 추가 승인·메시지 비용 없음 | **현재 사용** |
| AI 챗봇 Callback API | 한 요청의 늦은 최종 응답 | 봇 마스터가 **설정 → AI 챗봇 관리**에서 신청, 심사 약 1~2영업일; URL은 약 1분·1회만 유효; 봇테스트 콜백 토큰은 실제 호출 불가 | 추출+요약이 1분 안에 안정적으로 끝날 때 검토 |
| Event API | 봇이 나중에 먼저 메시지 발송 | 비즈니스 인증 채널·비즈앱 연결, 카카오 로그인 활성화, 채널 친구, 월렛 필요; 건당 15원(VAT 별도); 요청당 최대 100명 | PMF 확인 뒤 검토 |

Event API는 운영·개발 채널 모두 과금된다. 광고성 메시지는 `(광고)` 표기, 발송 시간, 고객센터 연락처, 수신 거부 등 추가 정책을 따라야 한다. Nuff의 “요약 완료” 1회성 정보 알림도 실제 적용 전 정책과 동의 흐름을 재확인한다.

## 8. 저장·처리 파이프라인

### 현재 배포 단위와 용어

현재 MVP는 회사를 여러 곳 사용하는 구조가 아니다. Cloudflare 안에서 다음 두 서비스를 사용한다.

- **Cloudflare Workers**: Nuff의 TypeScript 서버 코드를 실행한다.
- **Cloudflare D1**: 링크, 처리 작업, 분석 결과를 영속 저장한다.

`worker`라는 말은 두 가지 뜻으로 쓰여 혼동할 수 있다.

1. **Cloudflare Worker**: 코드를 실행하는 Cloudflare 상품 이름.
2. **백그라운드 작업자**: 대기 중인 분석 작업을 처리하는 소프트웨어 역할.

현재 [ingestion/worker.ts](../ingestion/worker.ts) 하나에 두 실행 입구가 있다. `fetch()`는 카카오의 HTTP 요청을 받아 D1에 저장하고 바로 응답한다. `scheduled()`는 Cloudflare Cron이 매분 호출하며 D1의 대기 작업을 가져와 분석한다. 논리적으로는 접수와 분석을 분리했지만, 배포되는 프로그램은 아직 하나다.

```text
Cloudflare 계정
├─ Worker: nuff-kakao-ingress
│  ├─ fetch()      카카오 요청 접수·즉시 응답
│  └─ scheduled()  매분 대기 작업 분석
└─ D1: nuff-ingestion
   ├─ capture_jobs 원본 URL과 처리 상태
   └─ contents     요약·태그·핵심 결과
```

영상 다운로드나 브라우저 자동화처럼 무거운 처리가 실제로 필요해질 때만 `scheduled()` 역할을 Railway/Render 등의 별도 분석 서버로 옮긴다. 그 전에는 서비스를 더 늘리지 않는다.

```text
POST /webhooks/kakao
  ├─ x-nuff-skill-key 해시 비교
  ├─ 본문 32 KiB 제한
  ├─ JSON 스키마 검증
  ├─ bot.id == KAKAO_BOT_ID 검증
  ├─ botUserKey를 내부 owner 해시로 변환
  ├─ 발화에서 http/https URL 최대 5개 추출
  ├─ URL 정규화
  ├─ owner+URL 중복 방지
  ├─ 사용자당 최근 1시간 60개 제한
  ├─ capture_jobs에 queued로 저장
  └─ SimpleText 즉시 응답

매분 예약 처리기
  ├─ 처리 가능한 작업 최대 4개 claim
  ├─ lease로 중복 처리 방지
  ├─ 안전한 HTTP 본문 추출
  ├─ AI 키가 있으면 구조화 분석, 없으면 발췌·키워드
  ├─ contents에 결과 저장
  ├─ 실패 시 1분/2분 지수 백오프
  └─ 3회 실패 후 failed, 원본 링크 유지
```

### YouTube 분석

YouTube URL은 `GEMINI_API_KEY`가 설정돼 있으면 Gemini API에 공개 URL을 직접 전달한다. Gemini가 영상과 음성을 읽고 Nuff의 구조화 형식인 제목, 한 문장 요약, 핵심 주장, 키워드, 주제를 반환한다. 키가 없거나 공개 영상으로 처리할 수 없으면 YouTube Data API 메타데이터 경로를 시도하고, 그것도 사용할 수 없으면 원본을 보존한 채 `needs_content`로 표시한다.

2026-09-24 실제 카카오톡에서 보낸 공개 YouTube 영상으로 다음 전체 경로를 확인했다.

```text
카카오톡 전송 → D1 queued → 예약 처리기 processing
→ Gemini 영상 분석 → 구조화 결과 검증 → D1 ready
```

Gemini의 YouTube URL 입력은 현재 Preview다. 무료 등급은 공개 영상만 지원하고 하루 최대 8시간 분량 제한이 있으며, 가격과 제한은 변경될 수 있다. API 키는 Cloudflare secret으로만 관리한다.

2026-09-24 AI Studio에서 확인한 현재 `Gemini 3.8 Flash` 무료 프로젝트 한도는 분당 5회(RPM), 분당 입력 250,000토큰(TPM), 하루 20회(RPD)다. 한도는 모델과 프로젝트별로 바뀔 수 있으므로 운영 전 AI Studio의 **비율 제한** 화면을 다시 확인한다. 현재 구조에서는 YouTube 영상 분석 한 건이 보통 API 요청 한 건을 사용하며 재시도도 요청량을 소비할 수 있다.

관련 코드:

- [ingestion/kakao.ts](../ingestion/kakao.ts): 인증, 사용자 구분, URL 수신, 명령, 카카오 응답.
- [ingestion/worker.ts](../ingestion/worker.ts): `/health`, `/webhooks/kakao`, 예약 작업 진입점.
- [ingestion/processor.ts](../ingestion/processor.ts): 작업 claim, lease, 재시도, 결과 저장.
- [lib/pipeline.ts](../lib/pipeline.ts): URL 검증, 본문 추출, AI/발췌 분석.
- [db/schema.ts](../db/schema.ts), [drizzle](../drizzle): D1 데이터 구조와 마이그레이션.
- [tests/ingestion.test.ts](../tests/ingestion.test.ts): 인증, 중복, 사용자 분리, 재시도, lease 계약 시험.

## 9. 실제 수신 검증표

| 시험 | 기대 결과 |
|---|---|
| YouTube 링크 한 개 | 5초 안에 저장 확인, DB 작업 1건 |
| 일반 기사 링크 한 개 | 즉시 저장 후 백그라운드에서 제목·본문·요약 생성 |
| 같은 계정에서 같은 링크 재전송 | 중복 저장하지 않고 기존 보관 안내 |
| 다른 카카오 계정에서 같은 링크 전송 | 서로 다른 보관함에 각각 1건 |
| URL 2개를 한 메시지로 전송 | 둘 다 저장 |
| URL 6개 전송 | 최대 5개 안내, 미저장 |
| `보관함` | 해당 사용자의 최근 5건만 표시 |
| `요약` | 실제 처리된 결과만 표시 |
| 링크가 아닌 문장 | 사용 안내, DB 미저장 |
| 잘못된 비밀 헤더 | HTTP 401 |
| 다른 봇 ID | HTTP 403 |
| 서버 설정 누락 | HTTP 503 |
| 분석 실패 | 원본 유지, 재시도 후 `failed` |
| `다시 시도` | 본인 실패 작업만 queued로 복구 |
| Instagram/YouTube/TikTok | URL 저장과 콘텐츠 추출 성공을 구분; 로그인·영상 벽은 `needs_content` 가능 |

## 10. 개인정보와 운영 정책 체크리스트

Nuff는 비식별 사용자 키를 해시해도 사용자의 링크와 이용 기록을 다룬다. 외부 사용자를 받기 전에 아래를 완료한다.

- [ ] 웰컴 또는 최초 사용 흐름에서 저장 항목, 목적, 처리 방식, 보유 기간, 삭제 방법을 알린다.
- [ ] 개인정보처리방침과 서비스 이용약관 URL을 마련하고 채널에서 접근 가능하게 한다.
- [ ] `내 데이터 삭제` 명령과 서버 삭제 처리를 구현한다. 현재 코드에는 아직 없다.
- [ ] 수집 목적에 필요 없는 프로필·전화번호·대화 원문을 저장하지 않는다.
- [ ] 카카오가 스킬에 전달한 사용자 키를 외부 공개 ID로 사용하지 않는다.
- [ ] 비밀 헤더, REST API 키, LLM 키를 코드·로그·문서에 남기지 않는다.
- [ ] 원문 링크와 추출 내용의 보유 기간과 파기 작업을 정한다.
- [ ] 링크가 제3자의 개인정보·불법물·저작권 침해물일 수 있으므로 신고와 삭제 절차를 정한다.
- [ ] 알림/구독 기능을 넣으면 쉬운 수신 거부와 동의 철회 기능을 함께 만든다.
- [ ] 광고성 메시지를 발송하면 카카오의 광고 표시·시간·연락처·수신 거부 정책을 적용한다.

카카오 운영정책상 개인정보는 서비스에 필요한 최소 범위로 수집해야 하며, 고지·동의한 목적을 넘겨 이용해서는 안 되고 목적 달성 후 지체 없이 파기해야 한다. 운영 전 실제 처리 항목을 기준으로 개인정보 전문가의 검토가 필요할 수 있다.

## 11. 자주 막히는 지점

| 증상 | 먼저 확인할 것 |
|---|---|
| 운영 채널 선택 목록이 비어 있음 | 최초 전체 배포 완료 여부, 봇 마스터 권한, 채널 매니저 권한, 다른 봇 연결 여부 |
| 스킬 서버 호출 실패 | 로컬 URL 사용 여부, 공개 HTTPS, URL 오타, DNS/TLS, Worker 배포 상태 |
| 401 | 카카오의 운영/테스트 헤더와 Worker secret 값 불일치 |
| 403 | `KAKAO_BOT_ID`와 실제 요청 `bot.id` 불일치 |
| 5초 타임아웃 | 요청 경로에서 본문 추출·AI 호출 여부; DB 저장과 즉시 응답만 수행해야 함 |
| 봇테스트는 되는데 실제 채널은 안 됨 | 배포 누락, 운영 URL/헤더 누락, 채널 연결, 바뀐 블록+스킬 동시 배포 여부 |
| 응답 말풍선이 안 보임 | 블록에서 `스킬 데이터로 사용` 선택 여부, JSON 형식, 30,720 bytes 제한, 스킬 오류 내역 |
| URL이 기본 폴백 문구로 감 | 폴백 블록에 스킬 연결 및 스킬 응답 설정 여부 |
| 명령이 폴백으로 감 | 해당 일반 블록 예상 발화 저장·배포 여부; 기능상 같은 스킬이라도 동작은 가능 |
| 완료 알림이 자동으로 안 옴 | 일반 스킬은 요청에 대한 즉시 응답 구조; Callback/Event API를 별도로 구성해야 함 |

## 12. 현재 결정과 미결정 사항

2026-09-25 제품 흐름 변경: 신규 사용자는 Nuff 이메일 계정으로 시작하고 iOS 공유 저장을 먼저 익힌다. 카카오는 설정의 **수집 채널 추가**에서 선택 연결한다. 기존 카카오 저장 자료를 연결할 수 있지만 다른 이메일 계정끼리는 자동 병합하지 않는다. 구현과 검증 상태는 [첫 사용 흐름](ONBOARDING.md)을 따른다. 카카오 공식 API 요건이 변경된 것은 아니다.

확정:

- 카카오 메시지 수집은 챗봇 스킬로 구현한다.
- 폴백 블록이 임의 URL을 받고 명령 블록은 조회 행동을 구분한다.
- 수신 요청은 저장까지만 하고 5초 안에 응답한다.
- 원본 URL은 분석 성공 여부와 관계없이 보존한다.
- `botUserKey` 원문은 저장하지 않고 봇 ID와 함께 해시한다.
- 초기 완료 확인은 사용자가 `보관함`/`요약`을 보내는 방식이다.

아직 해야 할 일:

- 여러 길이와 언어의 YouTube 영상으로 Gemini 분석 품질·시간·무료 한도를 측정한다.
- `보관함`, `요약`, `다시 시도` 전용 명령 블록 구성. 현재도 폴백 스킬을 통해 명령은 동작한다.
- 이후 실제 카카오 계정 2개를 이용한 사용자 분리 시험.
- 개인정보 고지·동의와 데이터 삭제 기능.
- Callback 또는 Event API 도입 여부 판단.
- 웹 계정과 카카오 사용자의 안전한 계정 연결.

## 13. 공식 기준 문서

- [봇 설정과 운영·개발 채널 연결](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/bot_setting)
- [블록, 웰컴·폴백·탈출 블록](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/block)
- [스킬 서버 등록, 헤더, 테스트, 5초 제한](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/make_skill)
- [블록에 스킬 연결과 스킬 데이터 응답](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/apply_skill_to_block)
- [SkillPayload와 응답 JSON 규격](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/answer_json_format)
- [봇테스트와 요청·응답 JSON 확인](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/bot_test)
- [전체·부분 배포와 블록/스킬 동시 배포](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/deploy)
- [스킬 오류 내역](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/check_skill_error_history)
- [AI 챗봇 Callback API](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/ai_chatbot_callback_guide)
- [Event API, 요건과 과금](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/event-api)
- [카카오톡 채널 관계 웹훅](https://developers.kakao.com/docs/latest/ko/kakaotalk-channel/callback)
- [챗봇 관리자센터 운영정책](https://chatbot.kakao.com/policy/operation)
- [Gemini API YouTube 영상 이해](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Gemini API 가격](https://ai.google.dev/gemini-api/docs/pricing)

공식 UI의 메뉴 이름은 개편될 수 있다. 기능 규격이나 정책이 바뀌는 작업을 시작할 때는 위 링크의 수정일과 관리자센터 공지를 다시 확인하고, 확인 날짜와 바뀐 결정을 이 문서에 갱신한다.
