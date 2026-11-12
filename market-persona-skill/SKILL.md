---
name: market-persona
description: Generate Oneuldo persona action traces with the whole-trace authoring mode (an isolated Luna actor writes one decision at a time and the simulator checks each), then optionally validate persona fidelity or replay traces in an isolated development app.
---

# Oneuldo 페르소나 행동 trace 생성

이 스킬은 **감독(에이전트)이 읽는 절차서**다. 행동을 작성하는 배우(Luna)에게는 이 스킬이나 하위 문서를 읽게 하지 않는다. 배우에게 필요한 정보는 bundle과 실험 지시문으로 모든 배우에게 같게 전달한다. 실험 지시문은 실험 입력이므로 이 스킬 안에 두지 않고 실험별로 고정·기록한다.

## 작업별로 읽을 문서

필요한 작업의 문서만 연다.

| 작업 | 문서 |
| --- | --- |
| trace 생성 (기본) | [시작 문서](generation/whole-trace.md) — 결정 형식·응답 해석·제출 실패 등은 시작 문서의 문서 표에서 필요한 것만 연다 |
| 행동 상한·시스템 계산·seed와 재현 | [생성 범위·상한·재현](generation/scope-and-limits.md) |
| 페르소나 고르기·수정 | [페르소나 선택](personas.md) |
| 페르소나 충실도 검증 | [검증 절차](validation/procedure.md), [성향 카탈로그·지표](validation/trait-catalog.md), [블라인드 판별](validation/blind-review.md) |
| 앱에서 재생 (요청받았을 때만) | [앱 연결과 재생](replay/app-replay.md) |
| 과거 결과 재현·비교 | [레거시 목록](legacy/README.md) |
| 과거 기본값·채택 경위·실험 결과 | [변천 기록](history/changelog.md) |

## 표준 절차: whole-trace 작성 보조 모드

1. 감독이 `prepare_whole_trace({personaId,seed,snapshotFilePath 또는 tabId,maxRepairs})`로 `requestId`와 bundle을 받는다. `bundle.inputHash`는 후보 밖의 출처 기록에 남긴다.
2. 배우 입력은 준비 응답을 그대로 주지 않고 `node market-simulator/whole-trace-actor-input.cjs <owner/prepare-response.json> <slot/actor-input.json>`으로 만든다. 이 도구는 `worldReference`(숨은 매장 지도·재고·정답 목록)·`choiceCatalog`(전체 선택지 목록)·`sourceFiles`·`diagnosticDirectory`를 빼고, 이 키들을 쓰라고 하던 안내 문장을 작성 보조 모드용 문장으로 바꾼다. 출력 요약(해시·제외 키·바꾼 문장)은 슬롯 기록에 남긴다. 한 인물·한 조건·한 seed·한 request만 받는 **새 배우 문맥**에 이 `actor-input.json`과 실험 지시문만 전달한다. 배우 호출은 요청별 우체통(`market-simulator/whole-trace-mailbox.cjs`)을 통해 같은 요청에 묶는다.
3. 배우는 `begin_whole_trace_authoring` → `append_whole_trace_decision`을 결정마다 반복한다. 통과하면 응답의 현재 화면·선택지 메뉴로 다음 결정을 쓰고, 거절되면 이유를 보고 같은 결정을 고쳐 쓴다. 필요하면 `whole_trace_authoring_menu`로 현재 메뉴를 다시 읽는다.
4. 종료 결정 뒤 `finish_and_submit_whole_trace`(우체통) 또는 `finish_whole_trace_authoring` 후 제출로 전체 후보를 제출·검증해 trace 파일을 저장한다.
5. 생성·검증만 요청받았으면 여기서 끝낸다. 앱 재생까지 요청받았을 때만 `validate_trace` → `play_trace` → `replay_status`를 [앱 연결과 재생](replay/app-replay.md)에 따라 실행한다.

배우 세션은 실제로 `gpt-6-luna` / reasoning `low`로 설정한다. MCP는 모델을 전환하거나 배우 세션을 자동으로 만들지 않으며, trace의 모델 라벨만으로 실제 호출 모델을 입증하지 않는다. MCP를 쓸 수 없으면 `node market-simulator/cli.cjs interactive` 또는 독립 호스트(`host-start` 등)로 같은 도구를 호출한다.

## 반드시 지킬 규칙

- **배우 문맥 분리:** 다른 인물·조건·seed·요청의 bundle이나 목표 ID·선택지를 같은 배우 문맥에 주지 않는다. 서버는 이 분리를 강제하거나 입증하지 않는다.
- **배우의 지식:** 세계 참고 자료의 미발견 상품·장소·목표를 인물이 아는 사실로 쓰지 않는다. 인물의 지식은 실제 본 화면, 읽은 목록, 연 매대, 받은 도움뿐이다.
- **대신 고르지 않기:** 감독·시뮬레이터는 행동, 수량, 종료, 기억 선언(`actorState`·`memoryUses`)을 채우거나 고치지 않는다. 실수·포기·성공을 강제하거나 횟수를 채우지 않는다.
- **사후 변조 금지:** 좌표·로그·대상 ID·후보를 사후에 바꾸지 않는다. 미션이 달라졌으면 새 snapshot으로 다시 생성한다.
- **보고 범위:** 오프라인 생성·검증 통과를 실제 앱 재생, 백엔드 수락, 학습 완료로 보고하지 않는다. 기술 예산 초과는 기술 실패이며 인물의 포기로 바꾸지 않는다.
- **표본:** 독립 표본에는 새 seed를 쓴다. 같은 seed를 독립 표본으로 중복 보고하지 않는다.
- **해석:** 페르소나는 경도 지적장애가 있는 허구의 성인에 대한 합성 행동 프로필이다. 결과를 임상적 타당성이나 실제 사람의 행동 검증으로 설명하지 않는다.
- **보안:** pairing URL·토큰·인증정보는 저장·공유·보고서에 남기지 않는다. 운영 대상에는 연결하지 않는다.

## 원본의 위치

- 페르소나 실행 정의의 단일 원본은 `market-simulator/personas/*.json`이다. 이 스킬의 문서를 고쳐도 배우 입력은 바뀌지 않는다.
- 도구의 실제 동작과 설치·실행·테스트는 [시뮬레이터 README](../market-simulator/README.md)와 `market-simulator/docs/`를 따른다.
