# 장보기 의도 trace → 실제 앱 재생 검증

검증일: 2026-09-26. 생성기는 의도 trace만 만들고, 개발용 웹앱이 기존 입력 경로로 실행한다. 로그는 앱의 원래 `MarketBehaviorTracker → behaviorEventQueue → /api/behavior-logs/batches` 경로에서 생성·저장된다.

## 구현과 완료 범위

| 항목 | 결과 |
| --- | --- |
| 공용 JSON Schema와 검증기 | 앱과 MCP가 동일 계약을 사용. 좌표·경로·로그·알 수 없는 필드 거절 |
| 페르소나 A/B | 기존 개인 설정·원자료 유지. A는 snapshot/seed 재현, B는 실제 모델의 의도 선택을 지원하며 저장된 trace로 재현 |
| 앱 입력 | 기존 joystick/runMovement, startDrag/moveDrag/finishDrag, 화면 버튼과 공유하는 핸들러 사용 |
| 시간·이동 | 실제 1배속, 가감속·방향 변화 상한·충돌 경로 재탐색. 반복해서 막히면 정지 |
| MCP | 일회성 pairing, loopback 브릿지, origin/계정 확인, 탭별 lease, 다른 테스트 계정의 탭 병렬 실행 |
| 격리 | 별도 로컬 DB·백엔드·인증키·테스트 계정 사용. 기존 사용자 서버는 변경하지 않음 |
| 실제 재생 | 두 페르소나로 브리핑부터 구매 검토 요청 수락·마을로 나가기까지 완료. 최종 소스 실행은 16개 스텝 |
| 실제 로그 저장 | 두 재생에서 앱이 만든 363 + 279 = 642개 이벤트가 DB에 저장됐고 authenticated receipt로 각 전체 sequence 확인 |
| 실제 사람과 동일 미션 비교 | **미완료: 사람이 직접 수행한 기준 세션이 제공되지 않음** |

실제 AI 분석 완료나 학습 효과는 이번 재생 검증의 결과가 아니다. 격리 서버의 분석 worker는 꺼 두었고, 분석 job이 접수되어 `QUEUED`로 저장된 것까지 확인했다. 승인한 종료 흐름은 일반 AI 미션의 `submitForReview → awaitReviewAccepted → leave`다. 이 흐름에는 별점 평가 화면이 없으며, 포기 흐름은 기존 `giveUp → skipRating → leave`를 사용한다.

## 실제 실행 증거

- 페르소나: `mild-intellectual-disability-adult` v2, `stochastic`, seed `replay-validation-1`.
- 미션: S01, 흰 우유 1개·바나나 1개.
- trace: `trace-e385ab37f568fdf1a7bced51058f5937`.
- replay: `8cea9f22-33d5-402a-8581-53e613f7c88d`.
- 실제 tracker session: `593697e3-f0ab-4213-9a9e-f6ceb0928206`.
- 백엔드: `http://127.0.0.1:18080`, DB `oneuldo_market_replay`.
- 재생 시간: 12:09:04.853–12:11:25.920 UTC, 약 141.1초.

도움 확인 → 음료 진열대 탐색 → 과일 진열대에서 바나나 드래그 → 냉장 진열대에서 우유 드래그 → 빈 2번 계산대 확인 → 직원에게 계산 요청 → 2번 계산대로 복귀 → 구매 검토 요청 → 마을로 나가기를 실제 앱에서 수행했다.

| 앱 측정값 | 값 |
| --- | ---: |
| 걷기 측정 프레임 | 3,569 |
| 이동 거리 | 2,616.67px |
| 프레임당 최대 이동 | 3.04px |
| 실제 이동 / `190 × dt` 최대 비율 | 0.5000 |
| 입력 벡터 최대 변화 | 0.05488 |
| 입력 변화율 최대 | 6.0976/초, 상한 10/초 |
| 이동 상한 / 입력 상한 위반 | 0 / 0 |
| 경로 재탐색 | 0 — 막힘 복구는 별도 테스트로 확인 |
| 상품 드래그 | 2회, 총 327프레임 |
| 완료 스텝 / 저장 확인 | 29 / 확인됨 |

측정은 걷기 재생 루프에서 수집했다. 전체 앱의 프레임률 측정값은 아니다. GIF는 실제 스크린샷을 촬영 간격대로 연결한 35.433초 발췌본(약 1.7fps)으로, 전체 재생 영상이나 높은 프레임률의 움직임 평가 자료는 아니다.

로그는 26개 배치에 걸쳐 DB에 저장됐다. sequence 1–363의 연속성·중복 없음, 발생 시간의 비감소, 미션 안내 후 이동, 계산 후 종료, 종료 이벤트 1개, 필수 필드 및 기존 schemaVersion을 확인했다. `SHOP.QUANTITY_CHANGED` 2건과 `SHOP.SESSION_ENDED`의 `EXIT_AFTER_SUBMISSION`을 포함한다. HTTP POST 응답 원문은 캡처하지 않았으므로 직접 관측한 `200/ACCEPTED`라고 보고하지 않는다. DB 영속화와 전체 sequence를 포함하는 receipt HTTP 200이 저장 증거다.

세션 로그의 약 252.9초에는 재생을 준비하며 첫 브리핑에서 기다린 시간이 포함된다. 이 전체 시간을 페르소나 반응 시간으로 사용하면 안 된다. JSONL은 실제 DB 행의 읽기 전용 export이며 SQL null을 보존한다. 원래 HTTP 요청 body의 바이트 사본은 아니다.

증거 파일은 [replay-validation 디렉터리](../market-simulator/output/replay-validation/)에 있다.

- [재생 GIF 발췌](../market-simulator/output/replay-validation/replay-drag-excerpt.gif)
- [재생한 trace](../market-simulator/output/replay-validation/mild-trace.json)
- [앱 측정·완료 보고](../market-simulator/output/replay-validation/replay-result.json)
- [실제 DB 로그 JSONL](../market-simulator/output/replay-validation/app-logs.jsonl)
- [DB 필드·순서·receipt 검증](../market-simulator/output/replay-validation/db-verification.json)
- [receipt](../market-simulator/output/replay-validation/app-receipt.json)

이 실제 실행 이후, 중간 브리핑·동일 세션 재시도 차단, 스텝 중단/시간 제한, 숨겨진 HUD 접근 정규화, 실패 응답의 replay ID, 직원 선택 처리에 회귀 보완을 했다. 위 파일들은 수정 전 실행 증거로 보존했다. 특히 이전 trace의 계산대 요청은 최종 계약에서 필수화한 계산대 ID가 생략되어 있을 수 있으므로, 현재 버전 재생 표본에는 아래 최종 trace를 사용한다.

## 최종 소스 재실행

검증용 Expo와 MCP를 다시 시작한 뒤 `quick-decider` v1, seed `replay-validation-final-1`로 새 trace를 생성·검증하고 실제 `play_trace`로 다시 실행했다. S01 미션에서 우유 1개와 바나나 1개를 담고 검토 요청을 접수한 뒤 마을로 돌아왔다. 새로운 호출이나 파일에서 과거 실행 결과를 복사해 사용하지 않았다.

- trace: `trace-2fb1d56addf23e045060af8a61a68f16`.
- replay: `c64e4770-74fb-41cd-9120-ede51d7405f0`.
- 실제 tracker session: `5e9e465c-2ece-4f4e-aa4d-d3b626534408`.
- 12:33:26.504–12:34:05.145 UTC, 약 **38.6초**, **16/16 스텝 완료**, 저장 확인 true.
- 걷기 1,748프레임, 1,839.78px. 프레임 최대 3.363741px, 속도 상한 비율 0.7110.
- 입력 벡터 변화율 최대 4.9505/초. 이동 상한·입력 상한 위반 **각 0건**.
- 드래그 2회, 111프레임. GIF는 실제 화면 52장을 촬영 간격대로 연결한 30.413초 발췌본이다.
- DB 저장 279개 이벤트 / 16개 배치, sequence 1–279. authenticated receipt HTTP 200의 전체 순번이 DB와 일치한다. 분석 job은 `QUEUED`이며 worker 실행 횟수는 0이다.

[최종 trace](../market-simulator/output/replay-validation/final-trace.json), [최종 앱 측정](../market-simulator/output/replay-validation/final-replay-result.json), [최종 GIF](../market-simulator/output/replay-validation/final-replay-excerpt.gif), [최종 DB 로그](../market-simulator/output/replay-validation/final-app-logs.jsonl), [최종 DB/receipt 확인](../market-simulator/output/replay-validation/final-db-verification.json)을 별도로 보존했다.

사람이 수행할 S01의 첫 브리핑을 검증용 앱에 열어 두었다. [대기 세션](../market-simulator/output/replay-validation/human-reference-pending.json)은 `f880c71f-647b-4e0d-ad32-56469bb68ecd`이며 아직 사람이 직접 플레이한 기준 자료가 아니다. 같은 구매 목표지만 매장 배치는 별도로 생성되었다. 화면 준비 중 배정된 S02 두 건은 시작 전에 포기 처리했으며, 위 재생 로그 export에 포함하지 않았다.

## 페르소나 차이와 재현

동일 snapshot에서 각 페르소나를 12개 seed로 생성했다. 36개 모두 스키마 및 기존 게임 어댑터의 의미 검증을 통과했고, 각 페르소나의 12개 행동 시퀀스가 모두 달랐다. 반응 시간만 바뀐 시퀀스를 서로 다른 행동으로 세지 않는다.

| 페르소나 | 서로 다른 시퀀스 | 예정 반응 중앙값 | 평균 장바구니 확인 |
| --- | ---: | ---: | ---: |
| mild-intellectual-disability-adult | 12/12 | 2,830ms | 1.75 |
| careful-checker | 12/12 | 2,291ms | 2.00 |
| quick-decider | 12/12 | 715ms | 0.50 |

이는 정책이 계획한 의도와 대기 시간이며 실제 사람의 통계가 아니다. 실제 LLM을 새로 호출하는 B 모드의 동작이나 임상적 재현 정확도를 이 표로 검증하지 않는다. 최신 표본은 [36개 trace 보고서](../market-simulator/output/trace-verification-1790425812917/report.json)에 있다.

## 기존 동작 보존과 검사

`marketBehaviorTracker.ts`는 `f124a95` 원본을 바이트 단위로 복원했다. SHA-256은 `4f709dd6116f0823a53e8a8f957c87d16d3e4724bd7b2a2f86abe11b4398f90c`다. 독립 fixture와 실제 구현에 동일한 시계·동작을 적용해 이벤트 전체, 순서, 지연, 큐 호출, 종료 동작을 비교한다. `MarketSimulationScreen`의 help 로그 한 줄도 기존 방식으로 복원했다. `BehaviorLogRequest`와 큐 포맷은 변경하지 않았다.

기존 전체 프런트 검사 시점에 55 suites / 429 tests가 통과했다. 이후 추가 및 수정된 replay·화면·트래커·큐 관련 **13 suites / 119 tests**와 최종 TypeScript 검사가 통과했다. 타입 강화 후 deadline 9개 검사도 다시 통과했다. 정확한 이력은 [최종 검사 요약](../market-simulator/output/replay-validation/final-checks/summary.json)에 기록했다. 생성기/MCP/브릿지 **39개 테스트**와 TypeScript도 통과했다. 결과는 [시뮬레이터 최종 검사](../market-simulator/output/replay-validation/final-checks/simulator-tests.log)에 기록했다.

프로덕션 Expo export도 확인했다. 메인 번들에서 재생 연결 분기가 제거되고 연결 함수는 no-op이며 WebSocket 연결 코드는 남지 않는다. 미사용 schema/player lazy chunk는 남으므로 ‘재생 관련 모든 코드가 번들에서 물리적으로 삭제됐다’고 주장하지 않는다. [운영 빌드 검사](../market-simulator/output/replay-validation/production-final-check.json)를 참고한다. 플래그 없음·비활성 플래그·운영·비브라우저 환경에서는 identity fetch, WebSocket, 재생 타이머/리스너가 생기지 않는 회귀 검사도 통과했다.

`git diff --check`가 지적하는 tracker 183행 공백은 정확히 복원한 `f124a95` 원본에도 있다. 원본 일치 요구에 따라 유지했다.

실제 사람 기준 세션이 확보되면 같은 미션·환경의 sessionId를 별도로 식별하고 eventCode 집합, 이벤트별 필드 구조, 시간·순서 규칙을 비교해야 한다. 현재 fixture와 앱 로그 검사로 이 실제 사람 비교를 대체했다고 주장하지 않는다.

## 제거한 경로

- `frontend/src/behavior/marketEpisodeBehaviorLogs.ts`
- `frontend/__tests__/MarketEpisodeBehaviorLogs.test.ts`
- `frontend/src/behavior/marketBehaviorTrackerCore.ts` — 원래 tracker로 복원
- `market-simulator/src/backendExport.ts`
- `market-simulator/src/schemaValidation.ts`
- `market-simulator/test/export.test.cjs`
- `market-simulator/test/schema.test.cjs`
- `backend/src/test/java/oneuldo/behaviorlog/controller/SyntheticMarketBatchHttpTest.java`
- `docs/market-simulator-validation.json`, `docs/market-simulator-validation.md`
- simulator/batch/worker/runtime/types의 episode·BehaviorLogRequest 변환 및 export 출력
- MCP/CLI의 `generate_episode`, `validate_episode_schema`, `export_to_backend`와 `MARKET_SIM_TARGETS` 설정
- 기존 검증 스크립트·README·스킬의 직접 로그 생성/전송 워크플로우

예전 ignored output 파일은 과거 산출물로 보존했다. 실행 소스에서 남아 있는 이전 tool/필드 이름은 제거되었음을 검증하는 부정 테스트뿐이다. 별도 작업의 backend 분석 관련 변경 5개는 수정하지 않았다.

사용 방법은 [market-simulator README](../market-simulator/README.md)와 [market-persona 스킬](../market-persona-skill/SKILL.md)에 정리했다. 로컬 인증 파일·pairing URL·비밀번호는 공유 자료에 포함하지 않는다.
