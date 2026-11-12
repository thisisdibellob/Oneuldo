# 레거시 경로 (재현·비교 전용)

이 폴더의 경로는 새 생성의 기본이 아니다. 과거 결과를 재현·비교하거나 사용자가 명시적으로 요청했을 때만 사용한다. 저장된 자료의 행동·시간·관측 의미를 바꾸지 않는다. 버전별 채택 경위와 실험 결과는 [변천 기록](../history/changelog.md)에 있다.

| 문서 | 용도 |
| --- | --- |
| [feedback 경로](feedback-plan.md) | `begin_feedback_plan` → `step_feedback_plan` → `finalize_feedback_plan`. feedback-choice v1~v13 계약 |
| [한 번에 제출하는 whole-trace](whole-trace-one-shot.md) | 작성 보조 모드 이전 방식. 후보 배열 전체를 작성해 직접 `submit_whole_trace` |
| [Codex 증분 계획](actor-plan.md) | `begin_actor_plan` → `append_actor_plan` (episodic-choice-v10) |
| [검증 legacy v2](persona-validation-v2.md) | 기존 네 인물 고정 검증 절차와 구현 기록 |
| [학습 실험](learning-trials.md) | 반복 학습·맞춤 과제 효과 실험 (A/B/C arm) |
| [연구 참고 학습 규약](assistant-learning-protocol.md) | 어시스턴트 직접 배우 역할 수행 |
| [이전 MCP 실행 절차](legacy-mcp-workflow.md) | 과거 방식 재현용 |

브라우저에서 직접 행동을 제어하는 별도 경로는 [market-agent-mcp](../../market-agent-mcp/README.md)에 있다. 앱 재생 입력과는 다른 실행 경로이므로 같은 조건으로 섞지 않는다.
