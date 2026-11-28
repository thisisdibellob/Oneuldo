# 보호자 API 연결 계약 (구현 제안)

2026-11-20. **아래 guardian 경로는 새 앱의 클라이언트 계약이며 현 백엔드에 구현되어 있다는 뜻이 아니다.** 기존 인증 경로만 현재 서버에서 확인했다.

## 계정과 승인

- 자녀의 실제 플레이 주체 ID와 부모 ID를 분리한다. 기존 가입이 PARENT 기본값인 점, 행동 기록이 로그인 회원에 귀속되는 점을 먼저 정리해야 한다. 과거 부모 계정의 기록을 자녀 기록으로 자동 귀속하지 않는다.
- guardian_child_links: parent_id, child_id, status(ACTIVE/REVOKED), approved_at, revoked_at. 두 보호자가 한 자녀를 볼 수 있도록 관계 테이블을 사용한다.
- 연결 코드는 공유 승인 이후 생성하며 추측하기 어려운 8자리 영문·숫자를 사용한다. 만료·일회 사용·시도 제한을 서버에서 강제하고 저장 시 코드 원문을 보호한다. 코드 생성·승인은 자녀 계정 측 절차가 필요하다. 성인 이용자도 있으므로 부모라는 이유만으로 자동 열람 권한을 주지 않는다.
- JWT 서명·만료·PARENT 역할과 활성 연결을 서버에서 모든 자녀/보고서/경로 요청마다 확인한다. 응답의 childId를 프런트가 검사하는 것은 서버 인가의 대체가 아니다.
- 연결 해제 후에는 해당 부모의 신규 조회를 차단한다. 게임의 원본 기록을 삭제하지 않는다. 원본 기록의 보존·삭제 요청은 별도 정책과 절차로 다룬다.

## 인증 (현재 서버)

- POST `/api/auth/login`: `{email,password}` → `{accessToken,refreshToken,expiresIn,memberId,name,role,...}`. expiresIn은 초. 앱은 PARENT만 허용한다.
- POST `/api/auth/logout`: Bearer accessToken. 앱은 서버 연결 실패와 무관하게 로컬 토큰을 지운다.
- 자동 로그인·저장 토큰·refresh는 첫 버전에서 사용하지 않는다.

## 새 보호자 경로

| 메서드 / 경로 | 응답 |
| --- | --- |
| GET `/api/guardians/me/children` | 승인된 자녀 배열 `[{id,name,linkedAt}]` |
| POST `/api/guardians/me/children/link` | `{code}` 요청. 활성 연결 완료 후 204. 아직 승인이 필요한 코드를 성공으로 처리하지 않는다. |
| DELETE `/api/guardians/me/children/{childId}` | 연결 해제 후 204 |
| GET `/api/guardians/me/children/{childId}/reports` | 해당 자녀의 Report 배열. 기존 분석 결과를 조회하며 새 AI 호출을 하지 않는다. |

401: 재로그인. 403: 연결 권한 없음. 400/410: 코드 오류/만료. 409: 중복/사용 코드. 404/501: 서비스 준비 안 됨. 5xx: 조회 실패. 빈 자녀/보고서는 200 + `[]`로 구분한다. 서버는 에러 내용에 타 가족의 존재나 개인 정보를 노출하지 않는다.

첫 클라이언트 계약은 배열 조회다. 운영 데이터가 커지면 기간·cursor와 서버 pagination 계약을 앱과 함께 추가해야 한다. 타 자녀 자료를 내려받아 클라이언트에서만 가리는 방식은 금지한다.

## Report (src/domain.ts)

```json
{
  "id": "report-id",
  "childId": "approved-child-id",
  "game": "market",
  "title": "부탁받은 물건을 찾아 장보기",
  "completedAt": "2026-11-20T07:20:00Z",
  "durationSeconds": 148,
  "status": "completed",
  "analysisStatus": "ready",
  "result": "achieved",
  "summary": "관찰한 사실에 근거한 요약",
  "conditions": "물품 2종 · 지도 없음 · 예산 5,000원",
  "supportCount": 1,
  "objectives": [{"label":"흰 우유","quantity":1,"unit":"개","achieved":true}],
  "findings": [{
    "id":"finding-id",
    "observation":"직원에게 위치를 물었어요.",
    "interpretation":"이번 과제에서 확인한 범위의 설명",
    "evidence":"실제 사건과 시각",
    "evidenceEventIds":["event-id"],
    "suggestedSupport":"다음 연습에서 도울 방법",
    "alternativeExplanations":["함께 고려할 다른 설명"]
  }],
  "nextPractice":"같은 조건에서 다시 확인할 연습",
  "uncertainties":["게임의 한 번의 관찰임"],
  "analysisCreatedAt":"2026-11-20T07:23:00Z",
  "source":"human"
}
```

game: market/bus/library. status: completed/stopped. analysisStatus: ready/pending/failed. result: achieved/partial/undetermined. 준비 중에는 요약·판정·finding을 꾸며 만들지 않는다. synthetic/페르소나 자료는 이 실제 자녀 API에서 제외한다. 분석 버전·원본 근거 연결은 서버에서 보존한다.

## 선택적 route

Report.route가 없으면 경로 없음 상태다. 있으면 다음 형태다.

```text
{width,height,durationSeconds,
 fixtures:[{id,x,y,width,height,label,kind:shelf|checkout|entrance|exit}],
 points:[{x,y,elapsedSeconds,segment}],
 actions:[{id,x,y,elapsedSeconds,segment,kind,label,positionSource}]
}
```

월드 크기와 배치는 해당 플레이 시작 당시 스냅샷을 사용한다. 좌표 원점은 좌상단이며 가구 사각형·입구·출구·계산대의 위치를 함께 전달한다. points는 시간순 실제 기록이며 의도한 경로를 대신 쓰지 않는다. 다른 segment는 연결하지 않는다. actions.kind는 shelf-opened/shelf-closed/item-added/item-removed/staff-talked, positionSource는 recorded/last-known이다. 과거 마지막 확인 위치를 정확한 측정 좌표로 표시하지 않는다.

기존 게임 `episode.trajectory`의 points/actions와 sceneSnapshot을 서버에서 권한 검사 후 변환할 수 있다. 현재 프런트의 로컬 episode가 서버 DB에서 동일한 구조로 조회된다고 가정하지 않는다. 해당 백엔드 변환과 운영 수신 확인은 별도 작업이다.
