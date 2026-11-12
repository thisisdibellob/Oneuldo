# 공통 성향 블라인드 — A 먼저, B 나중

trace 생성에 참여하지 않은 새 판별 문맥을 사용한다. 판별자는 반환된 `traitRubric`, `publicStyles`와 요청한 panel 파일만 읽는다. 공통 축의 수준을 추정하며 인물 이름·개별 프로필 ID·장애 여부를 맞히지 않는다. 개별 인물의 설정, manifest, 원본 trace, 측정값, `blind-key.json`을 제공하지 않는다. `publicStyles`는 다섯 유형의 공통 설명이며 이번 표본의 정답 유형표가 아니다.

`prepare_blind_review`:

```json
{"runDirectory":"/absolute/output/checking-contrast-01","panel":"A"}
```

A는 행동·대상·순서·작성된 행동 전 대기시간을 제공하고, B는 여기에 `reason`을 더한다. A/B의 opaque ID와 순서는 각각 독립적으로 섞는다. 배우 의도·이름·seed·원본 경로 등 개인 식별 metadata는 제거한다. 블라인드 준비 뒤에는 표본 집합을 고정하며, 다른 표본을 추가하려면 별도 run을 만든다.

`submit_blind_review` 답안은 각 opaque ID 아래 다섯 축을 모두 포함한다. 근거가 없으면 `unknown`을 사용하고, 선택적 `confidence`는 0~1이다. 다음은 형식 예시이며 실제 판별 결과가 아니다.

```json
{
  "runDirectory": "/absolute/output/checking-contrast-01",
  "panel": "A",
  "answers": {
    "opaque-id-from-panel": {
      "traits": {
        "deliberation": "medium",
        "checking": "high",
        "exploration": "unknown",
        "persistence": "unknown",
        "helpSeeking": "unknown"
      },
      "confidence": 0.6
    }
  },
  "reviewerModel": "self-reported-model",
  "reviewerSession": "self-reported-new-session"
}
```

실제 답안은 해당 판의 모든 opaque ID를 포함해야 한다. 누락·추가 ID, 잘못된 축·수준·확신도는 거절한다. A 채점 후에만 B를 준비할 수 있고, B 판별 전에는 A 점수·정답을 판별자에게 알려주지 않는다. 같은 판별자의 자기 신고 라벨을 유지한다. 채점한 답안은 동일 재제출만 허용하며 점수를 보고 바꿀 수 없다.

채점은 `perTrait`별 정확도·판별 비율(`coverage`)·보류 수·판별했을 때 정확도·혼동 행렬과 `macroAccuracy`, `macroCoverage`를 보고한다. `unknown`은 전체 정확도의 분모에 남으며 정답으로 세지 않는다. 유형 분포에 고정된 25% 우연 정확도나 장애 판별을 적용하지 않는다. A/B는 같은 표본이므로 독립 반복 실험 두 번이 아니다. 판별자 독립성과 정답 키 미열람은 서버가 강제·입증하지 못하므로 `independenceVerified:false`, `keyIsolationVerified:false`로 표시한다.

판별자에게 줄 안내문은 [블라인드 행동 판별 안내](blind-review-guide.ko.md)를 쓴다.
