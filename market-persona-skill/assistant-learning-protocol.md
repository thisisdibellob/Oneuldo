# 어시스턴트 직접 플레이의 연구 참고 학습 규약 v2

새 직접 플레이의 기본 조건은 `research-learning-v2`다. 배우는 사용자 요청대로 **Codex 어시스턴트**, 학교 Qwen은 분석/추천을 담당한다. 확률 정책이나 코드가 행동을 대신 고르지 않는다. 실패→실패→성공 순서와 자동 능력 상승을 강제하지 않는다.

근거: [논문 6편·공식 자료 2건의 실제 내용과 변경 대응](../docs/ai/research/intellectual-disability/learning-model-adjustment-2026-10-01.ko.md), [저자·DOI·원출처·확인 범위](../docs/ai/research/intellectual-disability/learning-model-sources-2026-10-01.json). 기억 JSON의 형태나 민재의 학습률을 논문에서 추정한 것은 아니다.

## 새 조건과 경험 경계

1. [민재 v2](../market-simulator/personas/research-learning-minjae-v2.json)로 **새 실험 폴더와 빈 기억**을 만든다. 기존 `assistant-observed-v1`은 당시 조건의 보관/조회용이다. 다른 조건이나 다른 사람의 경험을 새 민재에게 이식하지 않는다. 초기 강점과 지원 필요는 고정하되, 실제 행동 변화는 배우가 경험을 바탕으로 선택한다.
2. 화면을 실제로 읽고 조작한 직후 원본을 저장한다. `research-observed-v2` 감사 기록의 각 에피소드에 id, 실제 sessionId, observationRef, observationSha256, 실제 observedAt, observed를 연결한다. `observed`에는 실제 안내·목록·상품·장바구니·피드백만 적는다. 목록 열기≠이해, 상품 일치≠개념 습득이다. 화면에 없던 정오 판정과 실행하지 않은 계획은 쓰지 않는다.
3. **전체 원본 기록은 감사자용**이다. 배우의 다음 행동 맥락에 전체 이전 로그, 분석/프로필 원문, 숨은 SKU 정답, 사후 채점표, 이번 검사 목적을 넣지 않는다. 자연어에도 이런 내용을 옮겨 적지 않는다. 현재 UI에 표시된 실제 추천 안내만 배울 기회가 된다.

## 경험을 다음 행동에 쓰는 순서

1. **부호화:** `researchEncodingContext`에 배우 자신의 이전 연상과 방금 관찰한 한 회차의 에피소드 ID만 넘긴다. 배우가 잠정적인 짧은 연상을 유지·수정·생략해 새 `research-memory-v2`를 작성한다. 각 연상은 skill, cue, association, `status:tentative`, 출처 episodeIds를 갖는다. 관리자가 매 회차 똑똑한 정답 전략을 써 주지 않는다. 아무 연상을 남기지 않아도 된다. 말해 보거나 되뇌는 행동은 선택한 경우만 기록하고 실제 사람의 내면을 측정한 것으로 설명하지 않는다.
2. **회상:** `researchRetrievalContext`의 현재 화면과 자신의 연상에서 배우가 지금 떠오르는 내용을 선택해 `research-recall-v2`로 적는다. 기억한 것 모두가 떠올라야 할 필요는 없다. 부분적/불확실한 기억과 회상 없음도 허용한다. 실수를 넣을 할당량이나 고정 망각률은 없다.
3. **행동:** `researchLearnerContext`는 현재 실제 UI와 **선택된 회상의 내용만** 행동 입력으로 만든다. 회상과 원본의 문장이 다르다고 정답 문장으로 덮어쓰지 않는다. AI가 목록 재확인·도움 요청·선택·수정을 결정한다. 실행하지 않은 계획과 기술 오류를 배우의 실패/학습 경험으로 바꾸지 않는다. 화면을 다시 볼 때에는 그 화면에 묶인 새 회상 입력을 만든다.
4. **확인:** CLI로 원본 파일 존재와 SHA-256을 검사하고, UI 원본과 기록의 내용/계정/sessionId를 별도로 대조한다. 해시와 형식 검사는 허구의 관찰, 자연어 추론, 이해 여부를 의미적으로 검증하지 못한다. 코드가 출력한 맥락 밖의 관리자 지식을 배우의 판단에 쓰지 않는다.

이 세 단계는 입력 경계를 위한 공학적 구현이다. 동일 어시스턴트의 기존 대화 내용을 실제로 삭제하거나 사람의 기억 과정을 증명하는 장치가 아니다. 단계 사이에 학습률을 계산하거나 성능을 자동 올리지 않는다.

## 능력과 도움의 기록

이름 찾기, 용량, 묶음 단위, 구매 수량, 이동, 결제를 따로 본다. 우유 숫자를 따라 고른 경험을 바나나 단위나 새 상품에서도 이미 익힌 절차로 만들지 않는다. 안내를 봄·안내대로 행동함·안내 없이 수행함을 구분한다. 구체적인 안내도 이해/적용/성공을 보장하지 않는다.

분석/추천 AI가 실제 이전 수행에 맞춰 안내와 난이도를 고른다. 배우의 행동을 성공 방향으로 수정하거나, 한 번 성공했다고 단계가 자동 올라가는 코드는 없다. 다음 조건을 **감사 기록에만** 적는다.

- `acquisition`: 지원을 이용한 연습. 필요하면 한 단계씩, 실제 앱의 예시·목록·텍스트 도움·실제 피드백을 이용한다.
- `independent-probe`: 동일 요구에서 추가 단서를 줄여 확인한다. 목표 목록은 계속 이용할 수 있다. 실제 지원 사용과 수행을 대조해야 독립 수행 여부를 말할 수 있다.
- `maintenance-probe`: 실제 간격 후 확인한다. 시각 차이를 기록하며 즉시 반복을 며칠 뒤 유지로 해석하지 않는다.
- `transfer-probe`: 새 상품/표기/단위/순서/배치 중 바뀐 것을 기록한다. 바뀐 자극에서도 적용하는지 확인하며 필요하면 다시 지도한다.

`researchPracticeAudit`는 제공된 도움의 level/access와 실제 관찰 간격을 남긴다. 이 함수는 능력 향상, 숙달, 독립 성공을 판정하지 않는다. 추가 정답 단서가 계속 있었거나 과제가 쉬워졌다면 그 조건을 숨기지 않는다. 실제 앱에 없는 영상·음성·신체 촉진을 제공했다고 쓰지 않는다.

## 실행 명령

저장 위치는 전용 로컬 실험 폴더다. 다음 초기화는 서비스/DB/앱을 변경하지 않고 빈 상태만 만든다. 이미 있는 폴더는 초기화하지 않는다.

```bash
node market-simulator/scripts/prepare-research-learner.cjs init \
  --run-id minjae-research-v2-001 --out output/minjae-research-v2-001
```

실제 UI를 관찰해 current.json, archive.json, 배우가 작성한 memory.json/recall.json을 준비한 뒤 해당 단계만 호출한다. `observationRef`는 저장한 UI 파일의 절대 경로 또는 저장소 기준 경로, SHA-256은 그 파일의 실제 바이트 해시다. 에피소드와 연상은 위 타입을 따르며 API 키를 넣지 않는다. 과거 결과에서 새 예제/플레이를 만들어내지 않는다.

```bash
node market-simulator/scripts/prepare-research-learner.cjs encode \
  --archive output/minjae-research-v2-001/archive.json \
  --memory output/minjae-research-v2-001/memory.json \
  --episodes just-observed-episode-id --out output/minjae-research-v2-001/encoding-context.json

node market-simulator/scripts/prepare-research-learner.cjs retrieve \
  --archive output/minjae-research-v2-001/archive.json \
  --memory output/minjae-research-v2-001/memory.json \
  --current output/minjae-research-v2-001/current.json \
  --out output/minjae-research-v2-001/retrieval-context.json

node market-simulator/scripts/prepare-research-learner.cjs decision \
  --archive output/minjae-research-v2-001/archive.json \
  --memory output/minjae-research-v2-001/memory.json \
  --current output/minjae-research-v2-001/current.json \
  --recall output/minjae-research-v2-001/recall.json \
  --out output/minjae-research-v2-001/decision-context.json

node market-simulator/scripts/prepare-research-learner.cjs audit \
  --archive output/minjae-research-v2-001/archive.json \
  --practice output/minjae-research-v2-001/practice-audit-input.json \
  --out output/minjae-research-v2-001/practice-audit.json
```

매번 출력은 별도 파일명으로 남긴다. 출력 파일이 이미 있으면 덮어쓰지 않는다. 코드는 모델을 호출하거나 게임의 행동/로그를 생성하지 않는다. 준비한 단계의 입력으로 Codex가 직접 역할을 수행한다. 조건 시작 전에 같은 구현/출처를 고정하고, 구조를 다시 변경하면 별도 조건으로 다룬다.

## 남는 한계

자료가 지지하는 교육/지원 원칙에 가깝게 조정했지만 개인의 학습 속도나 기억을 실측으로 보정한 모델은 아니다. 이번 코드 검사는 입력 경계를 확인하는 것이다. v2에서 수행이 향상되는지는 후속 실제 플레이 결과로 확인한다. 같은 어시스턴트가 설계·역할·평가를 수행하는 교란과 실제 참여자에 대한 효과 검증은 남아 있다.
