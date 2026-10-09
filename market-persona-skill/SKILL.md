---
name: market-persona
description: Generate seeded Oneuldo shopping intent traces with persona policies or an LLM, then replay them through real inputs in an isolated development web app. Use for persona gameplay samples, visible replay, movement and drag verification, and comparisons using app-recorded logs.
---

# Oneuldo 페르소나 의도 생성과 앱 재생

Node 생성기는 행동 의도 trace를 만든다. 앱이 trace 전체를 받아 기존 이동·버튼·드래그 입력으로 실시간 플레이하고 기존 tracker·queue가 로그를 기록·전송한다. 생성기에서 게임 로그를 만들거나 백엔드에 직접 올리지 않는다. 화면 실행 없이 생성한 trace는 실제 플레이 완료 결과가 아니다.

- **A — `stochastic`:** 세 프로필 모두 attention 설정으로 제한된 관찰·기억·주의 전환을 계획하고, shoppingStyle로 상품 비교·목록 확인·익숙한 선택·이동 방향 유지 성향을 적용한다. LLM이 매 행동을 결정한 것으로 설명하지 않는다.
- **B — `llm`:** 전체 페르소나 프롬프트와 관찰·누적 경험을 실제 모델에 전달한다. 사용자가 요청한 경우 켜며 실제 모델 호출의 시간과 비용을 고려한다. 원문 전달과 실제 사람 행동의 검증을 구분한다.

## 페르소나 선택

`list_personas`로 현재 버전과 설정을 확인한다.

프로필·정책 수정 후 기존 MCP/Node가 이전 버전을 반환하면 프로세스를 재시작한다. 공유 앱 코드도 바뀌었다면 새 번들을 로드하고 다시 연결한다. 저장된 trace는 자동 변경되지 않으므로 새 설정으로 새 trace를 생성한다.

| ID | 특성 |
| --- | --- |
| `mild-intellectual-disability-adult` | v5. 지민, 32세. 구체적인 한 항목씩 처리하며 여러 목표와 관심 전환 뒤의 기억 부담을 목록·장바구니·도움으로 보완한다. 카레를 좋아하고 스스로 목표로 복귀할 수도 있다 |
| `careful-checker` | v3. 서연, 38세. 신중하고 절약을 중시한다. 연습한 확인 순서는 강점이며 낯선 배치·조작과 여러 조건을 처리할 때 시간을 갖고, 비교·목록·장바구니 확인을 지원 전략으로 쓴다 |
| `quick-decider` | v3. 민수, 29세. 익숙한 상품에서는 빠르게 결정한다. 이름·규격·수량을 함께 기억해야 할 때 일부 조건을 놓칠 수 있고, 실제 불일치와 명확한 단서를 확인하면 선택을 수정한다. 좋아하는 상품은 짧게 살핀다 |

실행 정의의 단일 원본은 [지민](../market-simulator/personas/mild-intellectual-disability-adult.json), [서연](../market-simulator/personas/careful-checker.json), [민수](../market-simulator/personas/quick-decider.json)의 구조화된 JSON이다. 세 명 모두 **경도 지적장애가 있는 허구의 성인**이며 선택한 인지·적응 특성과 개인 성격이 서로 다르다. 각자의 강점·취향·경험·선택권을 유지하고 모든 어려움을 한 인물에게 합치지 않는다. 절약·빠른 결정·카레 선호 자체를 장애 특성으로 설명하지 않는다. 확률 수치는 합성 정책의 설계값이며 사람이나 장애 집단에서 추정한 통계가 아니다. 자연어 prompt는 B에 전달하고, A가 자연어의 모든 문장을 해석한다고 설명하지 않는다.

세 프로필의 근거를 확인하거나 수정할 때는 [사용자 역할 요청](../market-simulator/personas/references/persona-role-request.ko.md), [행동 이해 자료 전문](../market-simulator/personas/references/intellectual-disability-behavior-analysis.ko.md), [대응과 한계](../market-simulator/personas/audit.md)를 읽는다. [지민 v5](../market-simulator/personas/persona-mild-intellectual-disability-adult-v5.md), [서연 v3](../market-simulator/personas/persona-careful-checker-v3.md), [민수 v3](../market-simulator/personas/persona-quick-decider-v3.md) 사본은 각각 JSON prompt와 같다. 세 prompt에 두 원자료 전문을 보존하되, 자료 전체의 특성을 매번 모두 연기하지 않는다. 원문을 전달하거나 게임 행동 차이를 확인한 사실을 임상적 타당성 검증으로 설명하지 않는다.

## 연결과 생성

1. [실행 안내](../market-simulator/README.md)에 따라 전용 DB·인증키·테스트 계정과 개발용 웹앱을 준비한다. `MARKET_REPLAY_CONFIG`의 private 파일에 정확한 app/backend origin, 계정 allowlist, `isolated:true`를 설정한다. 운영 대상은 지원하지 않는다. 이 설정은 격리의 원격 증명이 아니므로 이미 실제 분리를 확인한 환경을 사용한다.
2. 지속 실행되는 MCP에서 `pair_app_session({appOrigin,backendOrigin,memberId})`을 호출한다. 반환 URL을 새 개발용 앱 탭으로 열고 지정 계정으로 로그인한다. URL의 일회성 토큰은 저장·공유·보고서 기록하지 않는다. 앱은 fragment를 메모리로 읽고 주소에서 제거한다.
3. 장보기 미션 시작 화면에서 `list_app_sessions`로 계정·백엔드·`ready:true`·`visible:true`와 snapshot ID를 확인한다. 사용자가 시작 버튼을 미리 누르지 않도록 한다. trace의 `start`가 기존 버튼을 누른다.
4. `generate_trace({personaId,seed,tabId})`로 해당 미션의 trace를 파일에 저장한다. 오프라인 생성에는 실제 시작 전 snapshot 또는 snapshotFilePath를 대신 사용한다. LLM 모드 키는 `llm.apiKeyEnv`에 환경변수 이름으로만 전달한다.
5. `validate_trace({traceFilePath,tabId})`가 성공한 뒤 `play_trace({traceFilePath,tabId})`로 전체 trace를 전달한다. 미션이 달라졌으면 새 snapshot으로 다시 생성한다. 좌표·로그·대상 ID를 사후 변조하지 않는다.

## 재생과 검증

`replay_status({replayId})`로 실제 앱의 진행·완료·실패·측정값을 확인한다. AI 분석 흐름은 요청 수락을 기다린 후 나가기까지 수행한다. 중단은 `stop_replay({tabId})`로 요청하며 앱 확인까지 lease가 유지된다. 연결 상실·heartbeat 만료·화면 숨김·미션/계정 변경 시 중단을 해결하고 새 pairing으로 시작한다. 다른 계정의 앱 탭은 병렬 실행할 수 있다. 같은 계정·탭 중복 실행은 허용하지 않는다.

이동은 실제 앱의 joystick과 게임 루프를 사용하고 상품은 기존 드래그 경로를 거친다. 시간 배속, 순간이동, 숨겨진 정답 사용, trace를 작은 이동명령으로 나눠 RPC 전송하는 방식은 사용하지 않는다. 화면 움직임·드래그와 실제 앱 측정값을 확인한다. trace 스키마 통과나 생성기의 실행 가능성 검사만으로 부드러운 화면 재생·백엔드 수락이 검증됐다고 보고하지 않는다.

`replay-manifest.jsonl`로 trace/hash·replay·탭·테스트 계정·questInstanceId·실제 tracker sessionId를 연결한다. 기존 `BehaviorLogRequest`에 합성 태그를 추가하지 않으므로 전용 DB/계정 격리를 유지한다. 보고에는 실행 모드, 페르소나/정책 버전, seed, trace 파일과 replay ID, 실제 완료 상태 및 확인한 앱 지표를 남긴다. 인증정보나 pairing URL은 제외한다.

## 주의·경험과 계획의 범위

사용자가 어시스턴트의 직접 역할 수행을 요청한 경우 [연구 참고 학습 규약 v2](assistant-learning-protocol.md)를 적용한다. 기본 직접 배우는 [민재 v2](../market-simulator/personas/research-learning-minjae-v2.json)이고, [학술/공식 근거와 한계](../docs/ai/research/intellectual-disability/learning-model-adjustment-2026-10-01.ko.md)를 확인한다. 전체 관찰 원본은 감사 기록으로 두고, 배우가 남긴 짧은 연상과 현재 회상을 분리한다. `researchEncodingContext` → `researchRetrievalContext` → `researchLearnerContext` 순서로 AI가 경험 반영과 행동을 선택한다. 실제 UI 파일의 해시 검사와 내용/계정 대조를 함께 수행한다. 도움을 받은 연습·독립 확인·유지·전이를 구분하며, 성공 횟수로 숙달을 자동 작성하지 않는다. 기존 v1 결과는 보존하고 새 조건에 가져오지 않는다.

현재 세 프로필 모두 trace v2/정책 v5를 사용한다. 저장된 기존 v1 trace도 재생할 수 있다. v2의 segment 앵커는 목적지의 일부 구간이며 전체 trace 안에 들어간다. `readList`는 실제 HUD 목록을 처음부터 끝까지 스크롤해 읽고, `browse`는 선반 페이지를 살핀다. 노출되지 않은 상품이나 전체 정답을 먼저 알고 선택하지 않는다.

상품 경험과 배치·조작 경험을 구분한다. `attentionExperience.visit`의 `first-play`/`revisit`로 회차 조건을 정하고, 반복 방문에는 이전 trace의 layoutKey와 memory를 명시적으로 넘긴다. 현재 배치 키는 생성기가 계산한다. 다른 배치에서는 공간 기억을 이월하지 않고 학습한 조작을 별도로 유지한다. [실행 안내의 회차 경험](../market-simulator/README.md#주의-정책의-회차-경험과-재생)에 옵션 예시가 있다.

`trace.attentionExperience.source`는 `planned-trace`다. 미리 만든 계획의 기억을 실제 앱 학습의 증거로 보고하지 않는다. 주의 이탈·복귀는 생성 단계에서 계획되며 실제 재생 중 관찰에 따라 새로 결정하는 적응 분기는 없다. 앱에 완성된 trace 전체를 전달하고 실제 수행 여부는 재생 결과로 확인한다.

attention 정책의 액션/시간 상한 초과는 기술적 생성 실패다. 이를 인물의 포기 행동으로 바꾸거나 완료한 표본에 포함하지 않는다. `attentionTag`·`cueRefs` 같은 기록은 생성 조건의 감사 정보이며 인물의 발화·실측 심리 상태가 아니다.

## 표본 차이와 재현

**새 표본에는 새 seed를 쓴다.** 같은 snapshot·정책/페르소나 버전·seed·입력 attentionExperience는 A 모드 재현용이다. 같은 seed를 독립 표본으로 중복 보고하지 않는다. B 모드 새 모델 호출은 seed 재현을 보장하지 않으므로 저장된 완성 trace를 다시 재생한다. 모델 실패를 A로 조용히 바꾸지 않는다.

같은 미션의 여러 seed와 다른 페르소나를 비교한다. 지연시간뿐 아니라 비교한 선반 페이지·선택 후 목록 확인·계산 전 확인·친숙한 상품 선택·관심 구간·방향 전환·복귀 차이를 보고한다. 대안이 없는 지정 상품에서 가격 비교의 효과를 부풀리지 않는다. “이유 없는 반복 금지”를 “모든 행동이 구매에 직접 유용해야 한다”로 해석하지 않는다. 실수·이탈 quota나 제출 전 완벽한 장바구니 복구를 강제하지 않는다. `reason`은 짧은 관찰 기술도 허용하며 인물의 자기설명이나 내부 사고 과정을 요구하지 않는다.

발화·억양·표정·유도 질문이 없는 게임에서 그런 행동을 만들어내거나 동의 편향의 임상적 타당성을 주장하지 않는다. 장애나 연기 사실을 게임 행동에 노출하지 않되 실험 보고에는 합성 정책 출처와 실제 사용 모드를 명시한다.

MCP를 사용할 수 없으면 `cli.cjs interactive`의 지속형 프로세스로 같은 도구를 호출한다. 단독 파일 생성·검증은 `cli.cjs generate`/`validate`를 사용한다. 전역 Codex 설정이나 플러그인을 자동 설치하지 않는다.


## 브라우저 MCP 제어 연결

브라우저에서 직접 행동을 제어하는 도구는 [market-agent-mcp](../market-agent-mcp/README.md)에 통합되어 있다. `market_bridge_status`, `market_start`, `market_observe`, `market_move`, `market_act`, `market_stop`, `market_export_episode`를 제공한다. 기존 앱 재생 입력과 MCP 제어는 서로 다른 실행 경로이므로 실제 사용 경로를 기록하고 같은 조건으로 혼합하지 않는다.

현재 연구 참고 학습 실험에서는 [직접 배우 학습 규약](assistant-learning-protocol.md)에 따라 배우 자신의 관찰과 회상을 사용한다. MCP를 사용해도 선택한 실제 페르소나 ID·버전·실행 ID를 기록하며, 예전 단일 페르소나를 자동으로 대신 적용하지 않는다. MCP 관찰과 종료 감사 기록의 공개 범위를 구분하고 숨은 상품·정답·사후 분석을 행동 입력으로 사용하지 않는다.

[이전 MCP 실행 절차](references/legacy-mcp-workflow.md)는 과거 방식의 재현용 참고 자료로 유지한다.
