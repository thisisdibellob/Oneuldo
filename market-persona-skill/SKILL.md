---
name: market-persona
description: Generate synthetic Oneuldo shopping game episodes and BehaviorLogRequest JSONL with persona policies, seeded batch simulation, and optional LLM decisions. Use for bulk play-log generation, persona comparisons, reproduction, and explicit export to an isolated test backend.
---

# Oneuldo 장보기 합성 로그 생성

게임 상태머신을 별도 Node 프로세스에서 실행한다. 기본 `stochastic` 정책은 브라우저·앱·로그인·네트워크 없이 동작한다. 두 모드 모두 기존 어댑터의 관찰·행동 제한을 유지한다.

- **A — `stochastic`:** 구조화된 개인 설정과 파라미터를 재고·정보량·친숙함·이전 행동·명확한 피드백 등 구현된 상황에 적용하는 확률적 근사다. LLM이 매 행동을 판단한 데이터라고 설명하지 않는다.
- **B — `llm`:** 전체 페르소나 프롬프트를 실제 모델에 전달하고 매 행동을 요청한다. 원자료를 빠짐없이 전달했다는 사실과 실제 사람의 행동을 검증했다는 주장을 구분한다. 모델 호출에는 시간과 비용이 들 수 있다.

## 페르소나 선택

먼저 MCP의 `list_personas`로 현재 버전과 파라미터를 확인한다. 기본 프로필:

| ID | 행동 특성 |
| --- | --- |
| `mild-intellectual-disability-adult` | v2. 두 원자료 전문과 허구의 32세 성인 지민 설정. 구체적 단서, 단계별 확인, 익숙한 경험, 재확인·도움·피드백 수정의 네 가지 안정 특성 |
| `careful-checker` | 상품·수량 재확인, 가격 비교, 느린 판단, 발견한 오류 수정 |
| `quick-decider` | 빠른 판단, 적은 재확인, 익숙한 상품 선호, 비슷한 상품·수량 조건에서 놓칠 가능성 |

실행 정의의 단일 원본은 [구조화된 프로필 JSON](../market-simulator/personas/mild-intellectual-disability-adult.json)이다. 그 안의 `character`는 허구의 개인 배경·선택한 특성이고 `parameters`는 실험 설정이다. 수치가 원자료에서 측정된 행동 확률이나 장애 집단의 통계라고 설명하지 않는다.

근거·프롬프트 충실도를 확인하거나 프로필을 수정할 때는 [사용자 역할 요청 원문](../market-simulator/personas/references/persona-role-request.ko.md), [행동 이해 자료 전문](../market-simulator/personas/references/intellectual-disability-behavior-analysis.ko.md), [대응 및 한계 기록](../market-simulator/personas/audit.md)을 읽는다. 원자료 사본은 출처 보존용이고 실행 시 직접 변경되는 정책이 아니다. [v2 프롬프트 문서](../market-simulator/personas/persona-mild-intellectual-disability-adult-v2.md)는 JSON `prompt`와 같은 읽기용 사본이며, v1 문서는 역사 기록이다.

자료의 모든 특성을 한꺼번에 적용하지 않고 JSON에 선택된 몇 가지 특성을 한 세션 내내 유지한다. 한 사람의 취향·강점·경험·선택권을 보존한다. 결과를 특정 개인이나 집단의 실제 행동·임상 근거로 표현하지 않는다.

## 생성 워크플로우

1. 사용자가 요청한 규모와 페르소나 비중에 맞춰 `generate_episode` 또는 `generate_batch`를 호출한다. 기본은 `mode: "stochastic"`과 로컬 JSONL 출력이다. 사용자가 소량 LLM 샘플을 원하면 `mode: "llm"` 및 모델 설정을 사용한다. 키는 환경변수 이름 `apiKeyEnv`로만 지정한다.
2. **새 표본을 생성할 때는 새로운 `seed`를 사용한다.** 같은 설정·시드는 재현용이다. 이전 seed를 반복해서 새 독립 표본처럼 보고하지 않는다. `generate_batch`는 배치 seed에서 에피소드별 seed를 파생한다.
3. 같은 매장의 행동 차이를 비교하려면 `environmentSeed`를 고정하고 행동 `seed`를 바꾼다. 다른 페르소나 비교에는 같은 환경·난이도·시드 집합을 사용한다. 결과를 억지로 다르게 만들기 위해 로그나 좌표를 사후 수정하지 않는다.
4. 생성된 경로로 `validate_episode_schema({batchFilePath})`를 실행한다. 실패하면 파일을 업로드하지 말고 보고된 계약·재생 오류를 해결한다.
5. 저장 경로, 모드, 페르소나·버전, seed, 완료·포기 수, 행동·이동·재확인·도움·오류와 가상 반응시간 통계를 간단히 보고한다. 차이가 있는지는 실제 통계로 확인한다.

`generate_episode`는 전체 로그 대신 저장 경로와 요약을 반환한다. `generate_batch`는 `count`, `seed`, `outputPath`, 선택적 `personaMix`, `concurrency`를 받는다. 기본 파일 경로는 단일 에피소드에만 제공되므로 배치는 항상 출력 경로를 지정한다. 기존 파일은 덮어쓰지 않는다.

이동은 가드가 적용된 `move`만 사용한다. 순간이동, 숨겨진 재고·정답을 정책 입력에 넣기, 최종 내보내기 결과로 같은 실행의 판단을 수정하기는 지원하지 않는다. 이동마다 충돌·거리·시간을 기록하고 검증한다. 사람처럼 보이게 하려고 이유 없는 오답·좌표 흔들림을 추가하지 않는다. 짧은 관찰 가능한 행동 이유만 기록하고 내적 사고 과정은 요구하지 않는다.

이 게임에 없는 발화·음성·표정 액션을 만들거나 행동 이유를 실제 발화처럼 보고하지 않는다. 동의 편향, 표현 언어, 억양, 감정이나 관계의 임상적 타당성은 현재 장보기 행동 로그로 검증했다고 주장하지 않는다. 게임 안에서는 장애나 연기 사실을 설명하지 않으며, 데이터 보고에서는 synthetic 출처와 실제 사용한 모드를 명시한다.

## 재현과 LLM

확률 정책은 동일 설정·seed로 재현한다. LLM 출력은 같은 seed만으로 보장되지 않으므로 저장된 `run`·`trace`와 원본 세션 ID를 사용해 재생·검증한다. 새 LLM 실행은 새 세션 ID를 부여하며, 재생은 원본의 모드·출처·시각을 유지해야 한다. 모델 호출 실패를 확률 정책으로 조용히 바꾸지 않는다. 실제 사용한 정책/모델 식별자는 provenance에 남는다. 모델 endpoint와 설정, CLI/API 예시는 [시뮬레이터 안내](../market-simulator/README.md)를 참고한다.

## 백엔드 전송

파일 생성 요청은 백엔드 전송 권한을 포함하지 않는다. 사용자가 전송을 명시적으로 요청한 경우에만 `export_to_backend({batchFilePath,targetEnv})`를 호출한다. `targetEnv`는 `local` 또는 `staging`만 지원한다. `MARKET_SIM_TARGETS`가 가리키는 설정에서 전용 테스트 DB와 테스트 사용자를 사용하고 `isolated:true`로 등록한 대상이어야 한다. 운영 전송은 차단된다.

내보내기는 전체 파일의 타입·합성 provenance·에피소드 재생을 확인한 뒤 50건씩 전송하고 응답의 `events[].status`를 검사한다. 재시도는 같은 배치·이벤트 ID를 보존한다. `ACCEPTED`와 `DUPLICATE` 수를 구분해 보고한다. 전송 실패 시 자동으로 다른 서버를 선택하지 않는다.

MCP가 연결되지 않은 환경에서는 저장소의 `node market-simulator/cli.cjs`로 같은 기능을 실행할 수 있다. 앱 실행이나 브라우저 브릿지를 요구하지 않는다. 이 스킬은 전역 Codex 설정을 변경하거나 MCP를 자동 설치하지 않는다.
