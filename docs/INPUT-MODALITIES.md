# Nuff 입력 유형 설계

> 마지막 공식 문서 확인: 2026-09-24

Nuff의 장기 목표는 링크만 모으는 앱이 아니라 텍스트, 이미지, 영상, 문서를 하나의 개인 보관함으로 정규화하는 것이다. 입력 경로마다 받을 수 있는 데이터와 제약이 다르므로 수집과 분석을 분리한다.

## 현재 동작

| 입력 | 현재 카카오 수신 | 현재 저장 | 현재 분석 |
|---|---:|---:|---:|
| 메시지 안의 HTTP/HTTPS 링크 | 가능 | 가능 | 일반 웹문서·공개 YouTube 가능 |
| 링크 없는 일반 텍스트 | 가능 | 미지원 | 미지원 |
| 카카오톡 사진 첨부 | 일반 스킬로 바로 받지 않음 | 미지원 | 미지원 |
| 카카오톡 동영상 첨부 | 공식 범용 전달 방식 확인되지 않음 | 미지원 | 미지원 |
| 카카오톡 파일 첨부 | 공식 범용 전달 방식 확인되지 않음 | 미지원 | 미지원 |

현재 `Nuff Bot`에 링크 없는 텍스트를 보내면 사용 안내만 반환하며 DB에 저장하지 않는다.

### iPhone 단축어 링크 수집

앱 출시 전 공유 동선을 검증하기 위해 Cloudflare Worker가 개인용 `POST /captures/shortcut`을 제공한다. iPhone의 단축어 앱에서 공유 시트 입력을 이 주소로 보내면 `ios_shortcut` 출처로 저장하고, 응답의 `message`에 `저장 완료 · 오늘 N개`를 반환한다.

- 요청 JSON: `{ "url": "공유 시트에서 받은 URL" }`
- 인증: 카카오 채팅에서 `앱 연결`로 받은 일회용 코드를 `/auth/pair`에 보내 발급한 기기 토큰. 이후 `Authorization: Bearer <device token>`을 사용한다.
- 원본 링크를 D1에 먼저 저장하고 기존 예약 분석 작업이 처리한다.
- 비밀키는 단축어와 Cloudflare Secret에만 저장하며 소스·문서·URL에는 넣지 않는다.
- 카카오 신원과 기기 토큰은 `user_identities`, `device_tokens`를 통해 같은 내부 사용자 ID에 연결된다.

## 카카오에서 가능한 범위

### 텍스트 메모

일반 발화는 `userRequest.utterance`로 스킬 서버에 전달된다. 링크가 없는 발화를 메모로 저장하는 기능은 서버와 DB 구조만 확장하면 구현할 수 있다. 일기처럼 쓰는 입력도 기술적으로 가능하지만, 사용 안내나 명령어까지 메모로 저장하지 않도록 명시적인 접두어나 모드를 둔다.

예시:

```text
메모: 오늘 발표에서 사용자의 저장 이유를 먼저 물어봐야겠다고 느꼈다.
일기: 오늘은 정보를 많이 봤지만 실제로 다시 볼 내용은 두 개뿐이었다.
```

### 이미지

카카오의 공식 경로는 **이미지 보안전송 플러그인**이다. 사용자가 봇의 요청 버튼을 통해 이미지를 최대 10장 전송하면 스킬 파라미터에 임시 보안 URL이 전달된다. URL은 최대 10분만 유지되므로 Nuff 서버가 즉시 내려받아 자체 객체 저장소에 복사해야 한다. 플러그인은 수집 목적·항목·보유 기간을 표시하고 사용자의 동의를 받는 흐름을 요구한다.

사용자가 채팅창에서 임의로 보낸 모든 사진을 현재 폴백 스킬이 자동 수신한다고 가정하면 안 된다.

### 동영상과 파일

현재 공식 챗봇 스킬·플러그인 문서에는 일반 동영상이나 임의 파일 첨부를 스킬 서버에 전달하는 범용 입력 방식이 확인되지 않는다. 카카오 채팅창에서 전송 자체가 가능하더라도 Nuff 스킬이 다운로드 URL이나 바이너리를 받는다는 보장이 없다.

MVP 대안:

1. YouTube·Drive·Dropbox 등의 공유 링크를 카카오톡으로 전송한다.
2. Nuff 앱의 OS 공유 메뉴로 파일을 보낸다.
3. Nuff 웹 업로드 화면에서 파일을 올린다.

대용량 영상과 문서는 Cloudflare Worker 요청 안에서 처리하지 않는다. 객체 저장소에 원본을 보관하고 별도의 작업 큐와 분석 서버에서 처리한다.

## 공통 데이터 구조

모든 입력을 바로 하나의 요약 형태로 억지로 바꾸지 않는다. 먼저 원본을 보존하고 입력 유형별 추출기가 공통 분석 자료를 만든다.

```text
Capture
├─ owner             사용자 내부 식별자
├─ source_channel    kakao / ios_share / web_upload
├─ source_type       link / text / image / video / file
├─ original_text     사용자가 입력한 원문
├─ original_url      링크 입력일 때 원본 URL
├─ object_key        업로드 파일의 비공개 저장 위치
├─ mime_type         image/jpeg, application/pdf 등
├─ created_at
└─ processing_status queued / processing / ready / needs_content / failed

Analysis
├─ title
├─ summary
├─ keywords
├─ topic
├─ claims
└─ priority          사용자가 나중에 지정하거나 행동으로 추정
```

입력별 처리기는 다음 공통 결과를 만든다.

```text
링크 → 웹 본문 또는 플랫폼 영상 분석
텍스트 → 원문 정리·태그
이미지 → OCR·장면 설명
영상 → 음성·프레임 분석
PDF/문서 → 텍스트 추출
                  ↓
          공통 Analysis 저장
```

## 구현 순서

1. **링크**: 현재 완료. 일반 웹문서와 공개 YouTube를 검증한다.
2. **텍스트 메모**: `메모:` 또는 `일기:` 접두어부터 지원한다.
3. **이미지**: 개인정보 고지와 객체 저장소를 먼저 준비한 뒤 카카오 이미지 보안전송 플러그인을 연결한다.
4. **파일·직접 영상**: 카카오에 억지로 맞추지 않고 Nuff 앱 공유 메뉴와 웹 업로드로 받는다.

## 공식 참고 문서

- [카카오 스킬 만들기와 SkillPayload](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/make_skill)
- [이미지 보안전송 플러그인과 임시 URL](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/apply_skill_to_plugin)
- [카카오 챗봇 플러그인 목록](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/plugin)
