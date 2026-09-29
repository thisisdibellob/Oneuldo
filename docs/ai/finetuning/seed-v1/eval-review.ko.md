# 평가 후보 25개

작성일: 2026-09-24 · 합성 개발 초안 · 전문가 검토 및 학습 승인 미완료

사건·수치·인물은 모두 가상이다. 문헌은 개인 행동의 직접 증거가 아니라 해석 범위와 지원 제안의 참고다. 목표 답변은 검토 가능한 한 가지 예시이며 표현을 그대로 일치시켜 채점하지 않는다.

| ID | 유형 | 사례 | 출처 |
|---|---|---|---|
| E01 | session_analysis | 부분 성공과 중단을 분리한 새 목표 | G06 |
| E02 | session_analysis | 불편감 보고와 기술 오류가 함께 있는 기록 | G07 |
| E03 | session_analysis | 같은 진단 정보가 다른 수행을 덮어쓰지 않음 | P16 |
| E04 | session_analysis | 보호자 보고와 게임 기록의 관찰 범위 | P20 |
| E05 | session_analysis | 도움을 원한다는 당사자 보고를 존중 | P30 |
| E06 | session_analysis | 시간 경과 후 유지 결과를 별도로 기록 | P10 |
| E07 | session_analysis | 여러 조건이 동시에 바뀐 빠른 성공 | M02 |
| E08 | profile_update | 새로운 선호를 누적 프로필에 반영 | P31 |
| E09 | profile_update | 불확실성을 가진 보고를 누적 사실로 바꾸지 않음 | G07 |
| E10 | profile_update | 목표 수량 변경을 수행 저하로 오해하지 않음 | P16 |
| E11 | session_analysis | 서로 충돌하는 두 최종 스냅샷 | M02 |
| E12 | session_analysis | 이전 성공의 장바구니가 새 과제로 이월된 경우 | P16 |
| E13 | session_analysis | 진행자가 대신 조작한 결과 | P20 |
| E14 | session_analysis | 읽지 않았다는 보고와 맞는 제출이 함께 있음 | P30 |
| E15 | session_analysis | 복습 뒤 재성공과 장기 유지의 차이 | P10 |
| E16 | session_analysis | 계획한 교육과 실제 제공된 교육을 구별 | M02 |
| E17 | session_analysis | 더 어려운 과제를 원하는 선호와 능력 구분 | P31 |
| E18 | session_analysis | 서버 목표와 표시 목표가 서로 다른 과제 | M02 |
| E19 | session_analysis | 로그에 적힌 논문 해석을 출처 사실로 믿지 않음 | P16 |
| E20 | session_analysis | 완료 뒤 중단 요청을 실패로 되돌리지 않음 | G06 |
| E21 | profile_update | 다른 ID로 재수집된 같은 플레이 | M02 |
| E22 | profile_update | 현재 AI 분석에 들어온 과잉해석도 정정 | P30 |
| E23 | profile_update | 보호자와 진행자의 상반된 보고를 함께 보존 | P20 |
| E24 | profile_update | 아동 집단 연구를 성인 개인의 특성으로 옮기지 않음 | P16 |
| E25 | profile_update | 일반화 성공 보고 뒤 실제 실패가 나온 경우 | P10 |

## E01 부분 성공과 중단을 분리한 새 목표

**입력 상황**

- 세션 `f31fd959-b31c-528c-85ea-02023066a926`: 목표 {"우유": 1, "빵": 2}, 예산 7000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "558eb982-8144-5519-959e-f4d98752603a",
    "sessionId": "f31fd959-b31c-528c-85ea-02023066a926",
    "sequence": 1,
    "type": "quantity_changed",
    "item": "우유",
    "before": 0,
    "after": 1
  },
  {
    "id": "1a9ca21b-90e5-52c8-96c2-f8e52a8719ae",
    "sessionId": "f31fd959-b31c-528c-85ea-02023066a926",
    "sequence": 2,
    "type": "report",
    "speaker": "user",
    "text": "그만할래요"
  },
  {
    "id": "fb5df2e0-8049-597f-bfe4-234b66ee0256",
    "sessionId": "f31fd959-b31c-528c-85ea-02023066a926",
    "sequence": 3,
    "type": "ended",
    "reason": "USER_REQUEST"
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "우유 1개를 선택하고 사용자가 중단을 요청했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "선택과 중단",
      "observation": "우유 1개를 선택하고 사용자가 중단을 요청했다.",
      "interpretation": "선택 일부와 중단 의사는 확인되지만 제출 목표 달성 여부는 판단할 자료가 없다.",
      "suggestedSupport": "다음에 사용자가 연습을 원하면 2개 품목과 간단한 문자 지원으로 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "558eb982-8144-5519-959e-f4d98752603a",
        "1a9ca21b-90e5-52c8-96c2-f8e52a8719ae",
        "fb5df2e0-8049-597f-bfe4-234b66ee0256"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "f31fd959-b31c-528c-85ea-02023066a926",
      "judgment": "UNDETERMINED",
      "explanation": "중단 전 최종 제출이 없으며 중단 의사만으로 능력 실패를 판정하지 않는다.",
      "evidenceEventIds": [
        "1a9ca21b-90e5-52c8-96c2-f8e52a8719ae",
        "fb5df2e0-8049-597f-bfe4-234b66ee0256"
      ]
    }
  ],
  "uncertainties": [
    "중단의 이유와 기능은 확인되지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "희망 시 2개 품목 선택 관찰",
    "rationale": "중단을 문제행동으로 규정하지 않고 맥락을 보존한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "G06"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 중단 의사와 능력 판단 구분
- 피해야 할 주장: 회피 성향
- 피해야 할 주장: 강제로 계속 연습

**문헌 참고 범위**

- [G06 Challenging behaviour and learning disabilities prevention and interventions NG11](https://www.nice.org.uk/guidance/ng11/chapter/recommendations)
  - 확인 범위: NG11 권고 1.5 기능평가와 1.6 행동지원 계획 관련 절
  - 참고 내용: 행동의 맥락·기능, 의사소통, 신체·정신건강, 지원 환경을 함께 평가하도록 권고해용.
  - 한계: 어려운 행동은 지적장애의 필수 속성이 아니고, 전문 기능평가를 클릭 기록만으로 대체할 수 없어용.
  - 이 예제의 용도: 중단·반복 행동의 맥락을 검토하되 클릭으로 기능평가를 대체하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E02 불편감 보고와 기술 오류가 함께 있는 기록

**입력 상황**

- 세션 `0cd77c46-e197-54f3-b8e5-40629c1bd725`: 목표 {"쌀": 1, "물티슈": 1}, 예산 18000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "b2445d80-020f-589e-b47f-0e714ef1baab",
    "sessionId": "0cd77c46-e197-54f3-b8e5-40629c1bd725",
    "sequence": 1,
    "type": "report",
    "speaker": "user",
    "text": "화면을 보면 눈이 불편해요"
  },
  {
    "id": "2ffa0466-634b-55e5-8f42-27b17e63319f",
    "sessionId": "0cd77c46-e197-54f3-b8e5-40629c1bd725",
    "sequence": 2,
    "type": "render_error",
    "durationMs": 30000
  },
  {
    "id": "cc56edaf-2ef7-5350-aaac-fb95766c3524",
    "sessionId": "0cd77c46-e197-54f3-b8e5-40629c1bd725",
    "sequence": 3,
    "type": "ended",
    "reason": "USER_REQUEST"
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "눈 불편감 보고와 화면 오류가 기록된 뒤 종료됐다.",
  "findings": [
    {
      "id": "F1",
      "skill": "보고와 기술 조건",
      "observation": "눈 불편감 보고와 화면 오류가 기록된 뒤 종료됐다.",
      "interpretation": "불편감 보고와 오류는 구분해 보존하며 종료의 원인을 하나로 확정하지 않는다.",
      "suggestedSupport": "다시 연습할 경우 2개 품목의 간단한 문자 지원을 사용하고 불편감과 기술 상태를 확인한다.",
      "alternativeExplanations": [
        "사용자가 보고한 불편감 외에 기록된 화면 오류도 종료에 영향을 주었을 수 있으나 각 요인의 영향은 확인되지 않았다."
      ],
      "evidenceEventIds": [
        "b2445d80-020f-589e-b47f-0e714ef1baab",
        "2ffa0466-634b-55e5-8f42-27b17e63319f",
        "cc56edaf-2ef7-5350-aaac-fb95766c3524"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "0cd77c46-e197-54f3-b8e5-40629c1bd725",
      "judgment": "UNDETERMINED",
      "explanation": "최종 제출이 없고 불편감·기술 오류 조건이 함께 있다.",
      "evidenceEventIds": [
        "b2445d80-020f-589e-b47f-0e714ef1baab",
        "2ffa0466-634b-55e5-8f42-27b17e63319f",
        "cc56edaf-2ef7-5350-aaac-fb95766c3524"
      ]
    }
  ],
  "uncertainties": [
    "불편감의 의학적 원인과 종료에 대한 각 요인의 영향은 확인되지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "편안한 조건에서 2개 품목 관찰",
    "rationale": "개인의 상태 변화와 기술 조건을 기록하고 원인을 진단하지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "G07"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 자기보고로 표시
- 포함해야 할 의미: 오류와 보고 모두 보존
- 피해야 할 주장: 질환 진단
- 피해야 할 주장: 학습 의욕 없음

**문헌 참고 범위**

- [G07 Mental health problems in people with learning disabilities NG54](https://www.nice.org.uk/guidance/NG54/chapter/Recommendations)
  - 확인 범위: NG54 권고 1.7 평가 관련 절
  - 참고 내용: 평소와 다른 행동·기능 변화 평가에서 정신건강뿐 아니라 신체 상태·통증·감각·약물 등을 함께 검토해용.
  - 한계: 하나의 증상이나 게임 기록만으로 원인을 확정하는 지침이 아니에용.
  - 이 예제의 용도: 평소와 다른 변화의 원인을 단정하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E03 같은 진단 정보가 다른 수행을 덮어쓰지 않음

**입력 상황**

- 세션 `02d02e43-c285-54d3-b835-05e512f87ac2`: 목표 {"두부": 2, "당근": 1, "우유": 1}, 예산 8000원, 관찰 범위 COMPLETE
- 추가 조건: {"background": {"reportedDiagnosis": "경도 지적장애", "readingAbility": "미측정"}}

**합성 사건**

```json
[
  {
    "id": "d5ccdd9b-dd10-5163-9e48-98c431844bf7",
    "sessionId": "02d02e43-c285-54d3-b835-05e512f87ac2",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "두부": 2,
      "당근": 1,
      "우유": 1
    },
    "total": 6900
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "두부 2개·당근 1개·우유 1개를 6900원으로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "3개 품목 선택",
      "observation": "두부 2개·당근 1개·우유 1개를 6900원으로 제출했다.",
      "interpretation": "해당 과제는 성공이다. 진단 정보로 읽기나 기억 특성을 추가 추정하지 않는다.",
      "suggestedSupport": "다음에는 3개 품목을 유지하고 하나의 품목을 바꿔 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "d5ccdd9b-dd10-5163-9e48-98c431844bf7"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "02d02e43-c285-54d3-b835-05e512f87ac2",
      "judgment": "SUCCESS",
      "explanation": "제출 내용과 8000원 예산이 모두 맞다.",
      "evidenceEventIds": [
        "d5ccdd9b-dd10-5163-9e48-98c431844bf7"
      ]
    }
  ],
  "uncertainties": [
    "진단 범주만으로 개인의 인지 프로파일을 알 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "3개 품목 조건의 새 선택",
    "rationale": "집단 내부의 다양성을 고려하여 직접 관찰한 수행을 기준으로 제안한다.",
    "recommendedDifficulty": 2,
    "itemCount": 3,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P16"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 3개 품목 성공
- 포함해야 할 의미: 개인차 보존
- 피해야 할 주장: 지적장애이므로 기억력 낮음
- 피해야 할 주장: 근거 없는 난이도 하향

**문헌 참고 범위**

- [P16 Heterogeneity of Cognitive Profiles in Children and Adolescents with Mild Intellectual Disability (MID)](https://doi.org/10.3390/ijerph19127230)
  - 확인 범위: 초록과 방법·결과·논의·제한점
  - 참고 내용: 경도 지적장애로 분류된 폴란드 7~18세 16,411명에서 서로 다른 인지 프로파일을 보고했어용.
  - 한계: 검사와 표본에 따른 군집이에용. 과거 교육·지원 정보가 충분하지 않아 원인을 단정하거나 보편적 페르소나로 옮길 수 없어용.
  - 이 예제의 용도: 같은 진단 범주 안의 개인차를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E04 보호자 보고와 게임 기록의 관찰 범위

**입력 상황**

- 세션 `85590f71-e368-5a83-a55a-d555228e67e9`: 목표 {"양파": 3, "생수": 2}, 예산 6000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "e9243925-4bf8-57a9-be67-bb9a5d451cfb",
    "sessionId": "85590f71-e368-5a83-a55a-d555228e67e9",
    "sequence": 1,
    "type": "report",
    "speaker": "supporter",
    "context": "실제 매장",
    "text": "수량은 항상 틀려요"
  },
  {
    "id": "8e81b21c-8603-5f88-b752-943e73e4d1d0",
    "sessionId": "85590f71-e368-5a83-a55a-d555228e67e9",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "양파": 3,
      "생수": 2
    },
    "total": 5100
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "보호자는 실제 매장의 수량 어려움을 보고했고 게임에서는 목표 수량대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "정보원과 상황 구분",
      "observation": "보호자는 실제 매장의 수량 어려움을 보고했고 게임에서는 목표 수량대로 제출했다.",
      "interpretation": "다른 상황의 보고와 이번 게임 성공을 함께 보존하며 어느 쪽이 틀렸다고 단정하지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제에서 수량 조건을 바꾸며 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "e9243925-4bf8-57a9-be67-bb9a5d451cfb",
        "8e81b21c-8603-5f88-b752-943e73e4d1d0"
      ]
    },
    {
      "id": "F2",
      "skill": "게임 내 수량 선택",
      "observation": "게임의 최종 제출은 양파 3개와 생수 2개였다.",
      "interpretation": "이 게임 목표는 충족했지만 실제 매장 보고를 반박하는 증거로 확대하지 않는다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "8e81b21c-8603-5f88-b752-943e73e4d1d0"
      ],
      "suggestedSupport": "다음 2개 품목 게임의 수량 조건을 바꿔 수행 범위를 확인한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "85590f71-e368-5a83-a55a-d555228e67e9",
      "judgment": "SUCCESS",
      "explanation": "게임 제출의 수량과 예산은 목표에 맞다.",
      "evidenceEventIds": [
        "8e81b21c-8603-5f88-b752-943e73e4d1d0"
      ]
    }
  ],
  "uncertainties": [
    "실제 매장의 원본 관찰이 없고 게임과 지원 조건이 다를 수 있다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1",
      "F2"
    ],
    "goal": "2개 품목의 다른 수량 선택",
    "rationale": "정보원 차이와 환경 차이를 분리해 검토한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P20"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 보고와 직접 기록 구분
- 피해야 할 주장: 보호자가 거짓말
- 피해야 할 주장: 실제 매장도 항상 성공

**문헌 참고 범위**

- [P20 An Evaluation of Parent and Teacher Discrepancies on an Adaptive Behavior Measure for Youth with Autism Spectrum Disorder, Intellectual Disability, and Global Developmental Delay](https://doi.org/10.1007/s10803-022-05550-x)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 부모와 교사의 적응행동 평정은 관련되지만 차이가 있었어용.
  - 한계: 정보원 차이를 어느 한쪽의 오류로 단정할 수 없어용.
  - 이 예제의 용도: 정보원 간 불일치를 한쪽의 오류로 단정하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E05 도움을 원한다는 당사자 보고를 존중

**입력 상황**

- 세션 `c882d235-8461-53ea-b437-d2a3e6a64dc9`: 목표 {"빵": 2, "우유": 1}, 예산 7000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "42bd4fe5-cedb-5460-9b94-b2559afa0eb9",
    "sessionId": "c882d235-8461-53ea-b437-d2a3e6a64dc9",
    "sequence": 1,
    "type": "report",
    "speaker": "user",
    "text": "짧은 목록을 계속 보고 싶어요"
  },
  {
    "id": "f83afe35-4dc0-58e1-99d7-e0f01e39c819",
    "sessionId": "c882d235-8461-53ea-b437-d2a3e6a64dc9",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "빵": 2,
      "우유": 1
    },
    "total": 5900
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "짧은 목록을 유지하고 싶다는 보고 뒤 목표대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "지원 선호와 수행",
      "observation": "짧은 목록을 유지하고 싶다는 보고 뒤 목표대로 제출했다.",
      "interpretation": "성공과 지원 선호는 함께 성립하며 성공했다는 이유만으로 지원을 제거할 근거는 없다.",
      "suggestedSupport": "다음 2개 품목 과제에도 간단한 문자 목록을 유지한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "42bd4fe5-cedb-5460-9b94-b2559afa0eb9",
        "f83afe35-4dc0-58e1-99d7-e0f01e39c819"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "c882d235-8461-53ea-b437-d2a3e6a64dc9",
      "judgment": "SUCCESS",
      "explanation": "목표 품목·수량과 예산을 충족했다.",
      "evidenceEventIds": [
        "f83afe35-4dc0-58e1-99d7-e0f01e39c819"
      ]
    }
  ],
  "uncertainties": [
    "목록 없는 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "선호한 문자 지원으로 2개 품목 선택",
    "rationale": "당사자의 지원 선호를 결과와 함께 반영한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P30"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 선호 보존
- 포함해야 할 의미: 지원 제거하지 않음
- 피해야 할 주장: 도움 의존성
- 피해야 할 주장: 선호 무시

**문헌 참고 범위**

- [P30 Differences in Self and Proxy Assessments of Self-Determination in Young People with Intellectual Disability: The Role of Personal and Contextual Variables](https://doi.org/10.3390/bs13020156)
  - 확인 범위: 초록과 논의·대상과 맥락
  - 참고 내용: 13~21세 219명의 자기결정에 대해 당사자와 교사 보고가 달랐고 개인·환경 요인이 관련됐어용.
  - 한계: 스페인 특정 교육 맥락의 표본이에용. 교사와 다르다는 이유로 당사자 답변을 오류로 처리할 수 없어용.
  - 이 예제의 용도: 당사자 보고를 타인의 평가로 덮어쓰지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E06 시간 경과 후 유지 결과를 별도로 기록

**입력 상황**

- 세션 `b4cf07a3-e30b-5c89-9d8b-d37c0128554e`: 목표 {"바나나": 2, "요거트": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"day": 0}
- 세션 `a5447bea-2c00-5df2-90e4-2a9ed26aeaf5`: 목표 {"바나나": 2, "요거트": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"day": 14}

**합성 사건**

```json
[
  {
    "id": "070bcfce-d84d-58a2-a1fb-5960f5abf1bd",
    "sessionId": "b4cf07a3-e30b-5c89-9d8b-d37c0128554e",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "바나나": 2,
      "요거트": 1
    },
    "total": 4800
  },
  {
    "id": "b1c0ec47-38ef-5d31-904f-49fdae0263bc",
    "sessionId": "a5447bea-2c00-5df2-90e4-2a9ed26aeaf5",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "바나나": 1,
      "요거트": 1
    },
    "total": 3300
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "첫날은 목표대로 제출했고 14일 뒤에는 바나나 1개가 부족했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "시간 간격별 수량 수행",
      "observation": "첫날은 목표대로 제출했고 14일 뒤에는 바나나 1개가 부족했다.",
      "interpretation": "이번 재검사에서는 같은 성공이 관찰되지 않았다. 인지 퇴행이나 교육 무효를 뜻하지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제에서 목표 수량을 간단히 제시해 복습한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "070bcfce-d84d-58a2-a1fb-5960f5abf1bd",
        "b1c0ec47-38ef-5d31-904f-49fdae0263bc"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "b4cf07a3-e30b-5c89-9d8b-d37c0128554e",
      "judgment": "SUCCESS",
      "explanation": "첫날의 목표가 충족됐다.",
      "evidenceEventIds": [
        "070bcfce-d84d-58a2-a1fb-5960f5abf1bd"
      ]
    },
    {
      "sessionId": "a5447bea-2c00-5df2-90e4-2a9ed26aeaf5",
      "judgment": "FAILURE",
      "explanation": "14일 뒤 제출 수량이 부족하다.",
      "evidenceEventIds": [
        "b1c0ec47-38ef-5d31-904f-49fdae0263bc"
      ]
    }
  ],
  "uncertainties": [
    "두 날 사이의 다른 연습과 생활 조건을 알 수 없고 장보기 유지 효과를 검증한 설계가 아니다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 목표 수량 복습",
    "rationale": "다른 생활기술 연구의 유지·복습 구분을 참고하며 이번 개인의 교육 효과로 단정하지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P10"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 첫 성취와 유지 구분
- 포함해야 할 의미: 14일 간격
- 피해야 할 주장: 인지 퇴행
- 피해야 할 주장: 논문과 같은 복습 효과 보장

**문헌 참고 범위**

- [P10 Computer- and video-based instruction of food-preparation skills: acquisition, generalization, and maintenance](https://doi.org/10.1352/1944-7558-48.3.195)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 영상 기반 음식 준비 교육 후 수행이 좋아졌지만 유지 검사에서 저하되었고 복습 후 회복했어용.
  - 한계: 즉시 성취가 장기 유지로 이어진다고 볼 수 없어용.
  - 이 예제의 용도: 즉시 수행과 유지·복습 결과를 구별

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E07 여러 조건이 동시에 바뀐 빠른 성공

**입력 상황**

- 세션 `20046167-0257-5050-81d9-aeb408d80cb5`: 목표 {"달걀": 1, "우유": 2, "빵": 1}, 예산 10000원, 관찰 범위 COMPLETE
- 추가 조건: {"textSupport": "STANDARD"}
- 세션 `99fd369c-bd91-50cc-9753-b6d9e8031f65`: 목표 {"달걀": 1, "우유": 1}, 예산 10000원, 관찰 범위 COMPLETE
- 추가 조건: {"textSupport": "SIMPLIFIED"}

**합성 사건**

```json
[
  {
    "id": "46a50d4e-4773-5d80-a26e-304f66b1eb96",
    "sessionId": "20046167-0257-5050-81d9-aeb408d80cb5",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "달걀": 1,
      "우유": 2,
      "빵": 1
    },
    "total": 9500,
    "timeMs": 300000
  },
  {
    "id": "25cf9b76-db26-5164-b55a-bde248241322",
    "sessionId": "99fd369c-bd91-50cc-9753-b6d9e8031f65",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "달걀": 1,
      "우유": 1
    },
    "total": 5800,
    "timeMs": 90000
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "3개 품목은 300초, 2개 품목·간단한 문자 조건은 90초에 각각 목표대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "변경된 조건에서의 수행",
      "observation": "3개 품목은 300초, 2개 품목·간단한 문자 조건은 90초에 각각 목표대로 제출했다.",
      "interpretation": "속도 차이는 확인되지만 품목·수량·문자 조건이 함께 달라 교육의 단독 효과를 알 수 없다.",
      "suggestedSupport": "다음에는 2개 품목과 문자 조건을 유지하고 새 세션을 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "46a50d4e-4773-5d80-a26e-304f66b1eb96",
        "25cf9b76-db26-5164-b55a-bde248241322"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "20046167-0257-5050-81d9-aeb408d80cb5",
      "judgment": "SUCCESS",
      "explanation": "첫 과제 목표와 예산을 충족했다.",
      "evidenceEventIds": [
        "46a50d4e-4773-5d80-a26e-304f66b1eb96"
      ]
    },
    {
      "sessionId": "99fd369c-bd91-50cc-9753-b6d9e8031f65",
      "judgment": "SUCCESS",
      "explanation": "새 과제 목표와 예산을 충족했다.",
      "evidenceEventIds": [
        "25cf9b76-db26-5164-b55a-bde248241322"
      ]
    }
  ],
  "uncertainties": [
    "단일사례 효과 검증에 필요한 반복 측정과 조건 통제가 부족하다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "같은 조건의 2개 품목 수행 관찰",
    "rationale": "조건 변화와 반복 측정을 구분해 기록한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "M02"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 두 성공
- 포함해야 할 의미: 복수 조건 변화
- 피해야 할 주장: 교육으로 속도 향상 확정
- 피해야 할 주장: WWC 검증 통과

**문헌 참고 범위**

- [M02 What Works Clearinghouse Procedures and Standards Handbook Version 5.0](https://ies.ed.gov/ncee/wwc/handbooks/)
  - 확인 범위: WWC 5.0 단일사례 연구 장 VI 인쇄면 108~110쪽
  - 참고 내용: 단일사례 연구 평가에서 반복 측정, 측정 조건, 중재 시점과 교란 조건을 검토하는 기준을 제공해용.
  - 한계: 관련 장 일부를 읽었으며 이 보고서나 오늘도의 설계가 WWC 평가를 통과했다는 뜻은 아니에용.
  - 이 예제의 용도: 반복 측정과 조건 차이를 검토하되 단일 게임으로 교육 인과효과를 주장하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E08 새로운 선호를 누적 프로필에 반영

**입력 상황**

- 세션 `7c782276-30a2-5c52-874f-8689edde2e04`: 목표 {"우유": 1, "빵": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 세션 `e23ff7eb-0fcb-5696-94fb-02b7f4026b4a`: 목표 {"두부": 1, "당근": 1}, 예산 5000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "4b04bb3c-decc-5ae8-9396-fea591fa5e0f",
    "sessionId": "7c782276-30a2-5c52-874f-8689edde2e04",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "우유": 1,
      "빵": 1
    },
    "total": 4200
  },
  {
    "id": "c98b9182-a4e0-5347-81b6-87724f9d99cc",
    "sessionId": "e23ff7eb-0fcb-5696-94fb-02b7f4026b4a",
    "sequence": 1,
    "type": "report",
    "speaker": "user",
    "text": "더 어려운 것보다 같은 정도로 다른 물건을 사고 싶어요"
  },
  {
    "id": "6b0a09e1-18e5-5516-8d94-fde610a1642c",
    "sessionId": "e23ff7eb-0fcb-5696-94fb-02b7f4026b4a",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "두부": 1,
      "당근": 1
    },
    "total": 2600
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "성공했으므로 다음에는 4개 품목으로 높여야 한다."
}
```

**currentAnalysis**

```json
{
  "summary": "새 과제 성공과 연습 선호가 기록됐다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "비슷한 난이도를 원한다고 보고했고 두 목표 품목을 제출했다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "c98b9182-a4e0-5347-81b6-87724f9d99cc",
        "6b0a09e1-18e5-5516-8d94-fde610a1642c"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "e23ff7eb-0fcb-5696-94fb-02b7f4026b4a",
      "judgment": "SUCCESS",
      "explanation": "새 목표에 맞다.",
      "evidenceEventIds": [
        "6b0a09e1-18e5-5516-8d94-fde610a1642c"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "두 세션 모두 각 목표를 달성했고 새 세션에서 비슷한 난이도의 다른 물건을 원한다고 보고했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "목표 수행과 연습 선호",
      "observation": "두 세션 모두 각 목표를 달성했고 새 세션에서 비슷한 난이도의 다른 물건을 원한다고 보고했다.",
      "interpretation": "반복 성공을 근거로 난이도를 자동 상향하지 않고 표현된 선호를 다음 연습에 반영한다.",
      "suggestedSupport": "다음에도 2개 품목과 비슷한 수량·예산 조건으로 다른 물건을 제시한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "4b04bb3c-decc-5ae8-9396-fea591fa5e0f",
        "c98b9182-a4e0-5347-81b6-87724f9d99cc",
        "6b0a09e1-18e5-5516-8d94-fde610a1642c"
      ]
    },
    {
      "id": "F2",
      "skill": "새 목표의 제출",
      "observation": "새 세션에서 두부 1개와 당근 1개를 2600원에 제출했다.",
      "interpretation": "새 과제의 품목·수량·예산을 충족했다. 선호와 별도로 기록할 수행 사실이다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "6b0a09e1-18e5-5516-8d94-fde610a1642c"
      ],
      "suggestedSupport": "같은 난이도의 2개 품목 과제를 유지한다."
    }
  ],
  "uncertainties": [
    "더 어려운 조건의 능력은 평가하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1",
      "F2"
    ],
    "goal": "선호를 반영한 다른 2개 품목",
    "rationale": "표현된 선택과 관찰된 결과를 함께 반영한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P31"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 선호 반영
- 포함해야 할 의미: 단순 상향 없음
- 피해야 할 주장: 도전 회피 성향

**문헌 참고 범위**

- [P31 Navigating self-determination: Perspectives of people with intellectual disabilities](https://doi.org/10.1177/17446295251335910)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 당사자가 인식하는 독립성은 생활환경·역량·주변 사람의 태도 등에 따라 다양했어용.
  - 한계: 질적 표본의 경험이며 비율·인과 추정에 사용할 수 없어용.
  - 이 예제의 용도: 개인의 선택과 지원 선호를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E09 불확실성을 가진 보고를 누적 사실로 바꾸지 않음

**입력 상황**

- 세션 `47d0c4fd-9f37-5bb9-9706-c55ec1829311`: 목표 {"쌀": 1, "두부": 1}, 예산 15000원, 관찰 범위 PARTIAL
- 세션 `067103e1-2c6d-5a84-bc7c-9fd39d69209e`: 목표 {"쌀": 1, "두부": 1}, 예산 15000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "1ee6f061-2717-59ae-a8b0-d6884c4169bb",
    "sessionId": "47d0c4fd-9f37-5bb9-9706-c55ec1829311",
    "sequence": 1,
    "type": "report",
    "speaker": "supporter",
    "text": "오늘 피곤해 보일 수도 있어요"
  },
  {
    "id": "9f9f4b4d-0171-5ac1-ac55-bf3d43b99b3e",
    "sessionId": "47d0c4fd-9f37-5bb9-9706-c55ec1829311",
    "sequence": 2,
    "type": "position",
    "timeMs": 0,
    "x": 1,
    "y": 1
  },
  {
    "id": "e2b73685-1e0d-5e71-b094-e631785a358c",
    "sessionId": "47d0c4fd-9f37-5bb9-9706-c55ec1829311",
    "sequence": 3,
    "type": "position",
    "timeMs": 60000,
    "x": 1,
    "y": 1
  },
  {
    "id": "d62244c1-e378-596f-8471-201a856fb179",
    "sessionId": "067103e1-2c6d-5a84-bc7c-9fd39d69209e",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "쌀": 1,
      "두부": 1
    },
    "total": 12800
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "피로 때문에 과제를 하지 못했다."
}
```

**currentAnalysis**

```json
{
  "summary": "새 세션은 목표대로 제출됐다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "쌀 1개와 두부 1개를 예산 내에 제출했다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "d62244c1-e378-596f-8471-201a856fb179"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "067103e1-2c6d-5a84-bc7c-9fd39d69209e",
      "judgment": "SUCCESS",
      "explanation": "새 목표와 예산에 맞는다.",
      "evidenceEventIds": [
        "d62244c1-e378-596f-8471-201a856fb179"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "이전에는 피곤해 보일 수 있다는 보고와 정지가 있었고 새 세션은 목표대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "상태 보고와 새 수행",
      "observation": "이전에는 피곤해 보일 수 있다는 보고와 정지가 있었고 새 세션은 목표대로 제출했다.",
      "interpretation": "이전 피로 추정은 확인되지 않은 보고로 유지하며 새 성공을 피로 회복의 증거로 쓰지 않는다.",
      "suggestedSupport": "2개 품목 조건을 유지하고 이후 상태 보고와 실제 수행을 구분해 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "1ee6f061-2717-59ae-a8b0-d6884c4169bb",
        "e2b73685-1e0d-5e71-b094-e631785a358c",
        "d62244c1-e378-596f-8471-201a856fb179"
      ]
    }
  ],
  "uncertainties": [
    "피로의 존재·원인·변화를 측정하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 수행과 상태 보고 분리",
    "rationale": "평소와 다른 상태의 원인을 임의로 확정하지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "G07"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 보고의 불확실성 보존
- 피해야 할 주장: 피로로 실패했다가 회복

**문헌 참고 범위**

- [G07 Mental health problems in people with learning disabilities NG54](https://www.nice.org.uk/guidance/NG54/chapter/Recommendations)
  - 확인 범위: NG54 권고 1.7 평가 관련 절
  - 참고 내용: 평소와 다른 행동·기능 변화 평가에서 정신건강뿐 아니라 신체 상태·통증·감각·약물 등을 함께 검토해용.
  - 한계: 하나의 증상이나 게임 기록만으로 원인을 확정하는 지침이 아니에용.
  - 이 예제의 용도: 평소와 다른 변화의 원인을 단정하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E10 목표 수량 변경을 수행 저하로 오해하지 않음

**입력 상황**

- 세션 `1f64247d-f765-58cc-baa1-4326d247b366`: 목표 {"사과": 3, "우유": 2}, 예산 9000원, 관찰 범위 COMPLETE
- 세션 `d381495b-f1a0-5926-a7b1-529b4bf6b836`: 목표 {"사과": 1, "우유": 1}, 예산 5000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "6d86ddbd-3cd9-5c8f-9e20-f2d0cf8ea980",
    "sessionId": "1f64247d-f765-58cc-baa1-4326d247b366",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "사과": 3,
      "우유": 2
    },
    "total": 8200
  },
  {
    "id": "c781b7a0-3147-5b76-a525-dc9e41198c47",
    "sessionId": "d381495b-f1a0-5926-a7b1-529b4bf6b836",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "사과": 1,
      "우유": 1
    },
    "total": 3400
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "사과 3개와 우유 2개를 목표대로 제출했다."
}
```

**currentAnalysis**

```json
{
  "summary": "새 목표는 사과 1개와 우유 1개다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "새 목표 수량대로 3400원에 제출했다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "c781b7a0-3147-5b76-a525-dc9e41198c47"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "d381495b-f1a0-5926-a7b1-529b4bf6b836",
      "judgment": "SUCCESS",
      "explanation": "새 목표와 예산에 맞다.",
      "evidenceEventIds": [
        "c781b7a0-3147-5b76-a525-dc9e41198c47"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "이전에는 사과 3개·우유 2개, 새 세션에는 사과 1개·우유 1개를 각 목표대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "각 목표에 맞춘 수량 선택",
      "observation": "이전에는 사과 3개·우유 2개, 새 세션에는 사과 1개·우유 1개를 각 목표대로 제출했다.",
      "interpretation": "제출 수량 감소는 목표 변경과 일치한다. 능력 저하로 해석하지 않는다.",
      "suggestedSupport": "2개 품목을 유지하며 목표 수량을 명확히 제시한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "6d86ddbd-3cd9-5c8f-9e20-f2d0cf8ea980",
        "c781b7a0-3147-5b76-a525-dc9e41198c47"
      ]
    }
  ],
  "uncertainties": [
    "목표가 다른 두 세션으로 인지 능력 변화를 판단할 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목의 제시된 수량 선택",
    "rationale": "고정된 인지 특성을 가정하지 않고 개별 과제 맥락을 보존한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P16"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 목표 변경 명시
- 포함해야 할 의미: 두 성공
- 피해야 할 주장: 수량 감소를 퇴행으로 설명

**문헌 참고 범위**

- [P16 Heterogeneity of Cognitive Profiles in Children and Adolescents with Mild Intellectual Disability (MID)](https://doi.org/10.3390/ijerph19127230)
  - 확인 범위: 초록과 방법·결과·논의·제한점
  - 참고 내용: 경도 지적장애로 분류된 폴란드 7~18세 16,411명에서 서로 다른 인지 프로파일을 보고했어용.
  - 한계: 검사와 표본에 따른 군집이에용. 과거 교육·지원 정보가 충분하지 않아 원인을 단정하거나 보편적 페르소나로 옮길 수 없어용.
  - 이 예제의 용도: 같은 진단 범주 안의 개인차를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E11 서로 충돌하는 두 최종 스냅샷

**입력 상황**

- 세션 `c7b66dc9-f2d3-5ebc-b10a-bfb7a451b986`: 목표 {"배": 2, "빵": 1}, 예산 7000원, 관찰 범위 COMPLETE
- 추가 조건: {"orderSemantics": "두 파일을 합친 나열 순서일 뿐 실제 순서 미확인", "completionEvidence": "두 스냅샷 모두 최종이라고 표기"}

**합성 사건**

```json
[
  {
    "id": "5ca1a952-99bc-50e4-8fe2-11c7ac8e0db1",
    "sessionId": "c7b66dc9-f2d3-5ebc-b10a-bfb7a451b986",
    "sequence": 1,
    "type": "final_snapshot",
    "cart": {
      "배": 2,
      "빵": 1
    },
    "total": 5600,
    "reportedFinal": true
  },
  {
    "id": "08f2bbfe-282a-562b-9e47-810a8c5803e1",
    "sessionId": "c7b66dc9-f2d3-5ebc-b10a-bfb7a451b986",
    "sequence": 2,
    "type": "final_snapshot",
    "cart": {
      "배": 1,
      "빵": 1
    },
    "total": 3800,
    "reportedFinal": true
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "두 최종 스냅샷의 배 수량이 각각 2개와 1개로 다르다.",
  "findings": [
    {
      "id": "F1",
      "skill": "결과 자료의 불일치",
      "observation": "두 최종 스냅샷의 배 수량이 각각 2개와 1개로 다르다.",
      "interpretation": "실제 최종 상태를 확인할 수 없어 임의로 하나를 선택하지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제에서 확정된 최종 제출 기록을 확보한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "5ca1a952-99bc-50e4-8fe2-11c7ac8e0db1",
        "08f2bbfe-282a-562b-9e47-810a8c5803e1"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "c7b66dc9-f2d3-5ebc-b10a-bfb7a451b986",
      "judgment": "UNDETERMINED",
      "explanation": "서로 모순되는 최종 스냅샷의 우선순위가 확인되지 않았다.",
      "evidenceEventIds": [
        "5ca1a952-99bc-50e4-8fe2-11c7ac8e0db1",
        "08f2bbfe-282a-562b-9e47-810a8c5803e1"
      ]
    }
  ],
  "uncertainties": [
    "수집된 나열 순서를 실제 행동 순서로 사용할 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "최종 기록이 확인된 2개 품목 관찰",
    "rationale": "측정 자료의 조건과 불일치를 먼저 확인하는 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "M02"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 두 스냅샷을 함께 제시
- 포함해야 할 의미: 판단 보류
- 피해야 할 주장: 마지막 줄이므로 무조건 최종
- 피해야 할 주장: 성공 자료만 선택

**문헌 참고 범위**

- [M02 What Works Clearinghouse Procedures and Standards Handbook Version 5.0](https://ies.ed.gov/ncee/wwc/handbooks/)
  - 확인 범위: WWC 5.0 단일사례 연구 장 VI 인쇄면 108~110쪽
  - 참고 내용: 단일사례 연구 평가에서 반복 측정, 측정 조건, 중재 시점과 교란 조건을 검토하는 기준을 제공해용.
  - 한계: 관련 장 일부를 읽었으며 이 보고서나 오늘도의 설계가 WWC 평가를 통과했다는 뜻은 아니에용.
  - 이 예제의 용도: 반복 측정과 조건 차이를 검토하되 단일 게임으로 교육 인과효과를 주장하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E12 이전 성공의 장바구니가 새 과제로 이월된 경우

**입력 상황**

- 세션 `ddcd6e3b-5756-59be-a7ba-eab80a183b59`: 목표 {"두부": 1, "생수": 2}, 예산 5000원, 관찰 범위 COMPLETE
- 세션 `2f3ef40b-e60e-56cf-b354-0dcb98f600ca`: 목표 {"두부": 2, "생수": 1}, 예산 5000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "4251ade1-4d71-57b5-86db-f4e19e544f7f",
    "sessionId": "ddcd6e3b-5756-59be-a7ba-eab80a183b59",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "두부": 1,
      "생수": 2
    },
    "total": 3100
  },
  {
    "id": "e9acc2b8-4b3a-5dbb-8045-c7337cef4622",
    "sessionId": "2f3ef40b-e60e-56cf-b354-0dcb98f600ca",
    "sequence": 1,
    "type": "cart_restored",
    "origin": "previous_session",
    "cart": {
      "두부": 1,
      "생수": 2
    }
  },
  {
    "id": "126a533b-4975-5f1c-989a-496ff4e444d8",
    "sessionId": "2f3ef40b-e60e-56cf-b354-0dcb98f600ca",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "두부": 1,
      "생수": 2
    },
    "total": 3100
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "이전 목표에 맞던 장바구니가 새 목표에도 그대로 제출됐다.",
  "findings": [
    {
      "id": "F1",
      "skill": "변경 목표와 이월 상태",
      "observation": "이전 목표에 맞던 장바구니가 새 목표에도 그대로 제출됐다.",
      "interpretation": "두 번째 제출은 새 수량 조건과 다르다. 자동 이월 상태를 직접 새로 고른 행동으로 해석하지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제에서는 새 목표 수량을 간단히 제시한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "4251ade1-4d71-57b5-86db-f4e19e544f7f",
        "e9acc2b8-4b3a-5dbb-8045-c7337cef4622",
        "126a533b-4975-5f1c-989a-496ff4e444d8"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "ddcd6e3b-5756-59be-a7ba-eab80a183b59",
      "judgment": "SUCCESS",
      "explanation": "이전 목표 수량을 충족했다.",
      "evidenceEventIds": [
        "4251ade1-4d71-57b5-86db-f4e19e544f7f"
      ]
    },
    {
      "sessionId": "2f3ef40b-e60e-56cf-b354-0dcb98f600ca",
      "judgment": "FAILURE",
      "explanation": "새 목표 두부 2개·생수 1개와 제출 수량이 다르다.",
      "evidenceEventIds": [
        "126a533b-4975-5f1c-989a-496ff4e444d8"
      ]
    }
  ],
  "uncertainties": [
    "새 목표와 이월 상태의 차이를 사용자가 인식했는지는 알 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "새 목표에 맞춘 2개 품목 선택",
    "rationale": "개별 과제 맥락을 보존하며 기억이나 고정 특성으로 원인을 단정하지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P16"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 이월 상태와 사용자 새 선택 구별
- 피해야 할 주장: 기억력 때문에 이전 물건을 다시 골랐다고 확정

**문헌 참고 범위**

- [P16 Heterogeneity of Cognitive Profiles in Children and Adolescents with Mild Intellectual Disability (MID)](https://doi.org/10.3390/ijerph19127230)
  - 확인 범위: 초록과 방법·결과·논의·제한점
  - 참고 내용: 경도 지적장애로 분류된 폴란드 7~18세 16,411명에서 서로 다른 인지 프로파일을 보고했어용.
  - 한계: 검사와 표본에 따른 군집이에용. 과거 교육·지원 정보가 충분하지 않아 원인을 단정하거나 보편적 페르소나로 옮길 수 없어용.
  - 이 예제의 용도: 같은 진단 범주 안의 개인차를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E13 진행자가 대신 조작한 결과

**입력 상황**

- 세션 `7e2cc1d2-78f5-5b5a-9cc4-622bd1fd8231`: 목표 {"우유": 1, "달걀": 1}, 예산 8000원, 관찰 범위 COMPLETE
- 추가 조건: {"taskPurpose": "사용자의 선택 수행 관찰"}

**합성 사건**

```json
[
  {
    "id": "784fe2d7-9438-510a-838f-6f9ca74dad16",
    "sessionId": "7e2cc1d2-78f5-5b5a-9cc4-622bd1fd8231",
    "sequence": 1,
    "type": "operator_changed",
    "actor": "facilitator",
    "scope": "선택부터 제출까지"
  },
  {
    "id": "40fe4003-40f1-540d-911e-1393f81bd4b5",
    "sessionId": "7e2cc1d2-78f5-5b5a-9cc4-622bd1fd8231",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "우유": 1,
      "달걀": 1
    },
    "total": 6800,
    "actor": "facilitator"
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "진행자가 상품 선택과 제출을 대신해 목표 장바구니가 만들어졌다.",
  "findings": [
    {
      "id": "F1",
      "skill": "조작 주체",
      "observation": "진행자가 상품 선택과 제출을 대신해 목표 장바구니가 만들어졌다.",
      "interpretation": "화면 결과가 맞아도 사용자의 직접 선택 수행은 확인되지 않았다.",
      "suggestedSupport": "다음 2개 품목 과제에서는 사용자가 직접 선택한 부분과 진행자가 도운 부분을 구분한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "784fe2d7-9438-510a-838f-6f9ca74dad16",
        "40fe4003-40f1-540d-911e-1393f81bd4b5"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "7e2cc1d2-78f5-5b5a-9cc4-622bd1fd8231",
      "judgment": "UNDETERMINED",
      "explanation": "목표 결과는 진행자의 조작이며 사용자의 선택 능력을 관찰한 자료가 아니다.",
      "evidenceEventIds": [
        "784fe2d7-9438-510a-838f-6f9ca74dad16",
        "40fe4003-40f1-540d-911e-1393f81bd4b5"
      ]
    }
  ],
  "uncertainties": [
    "사용자가 지시하거나 선택에 관여했는지는 기록에 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "조작 주체가 확인되는 2개 품목 관찰",
    "rationale": "다른 정보원·주체의 결과를 개인의 직접 수행으로 바꾸지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P20"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 주체 구별
- 피해야 할 주장: 독립 성공
- 피해야 할 주장: 대리 조작이므로 사용자 무능력

**문헌 참고 범위**

- [P20 An Evaluation of Parent and Teacher Discrepancies on an Adaptive Behavior Measure for Youth with Autism Spectrum Disorder, Intellectual Disability, and Global Developmental Delay](https://doi.org/10.1007/s10803-022-05550-x)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 부모와 교사의 적응행동 평정은 관련되지만 차이가 있었어용.
  - 한계: 정보원 차이를 어느 한쪽의 오류로 단정할 수 없어용.
  - 이 예제의 용도: 정보원 간 불일치를 한쪽의 오류로 단정하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E14 읽지 않았다는 보고와 맞는 제출이 함께 있음

**입력 상황**

- 세션 `68a973dc-9db1-5df8-8604-f05b769a2b8c`: 목표 {"우유": 1, "바나나": 2}, 예산 7000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "343f27e5-0c7d-558b-88c3-ae457153caa3",
    "sessionId": "68a973dc-9db1-5df8-8604-f05b769a2b8c",
    "sequence": 1,
    "type": "report",
    "speaker": "user",
    "text": "이번에는 글은 안 읽고 해봤어요"
  },
  {
    "id": "02fe0a94-909a-59a9-bab7-956af7487bb0",
    "sessionId": "68a973dc-9db1-5df8-8604-f05b769a2b8c",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "우유": 1,
      "바나나": 2
    },
    "total": 5700
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "글을 읽지 않았다는 사용자 보고와 목표대로인 제출이 함께 기록됐다.",
  "findings": [
    {
      "id": "F1",
      "skill": "보고와 과제 결과",
      "observation": "글을 읽지 않았다는 사용자 보고와 목표대로인 제출이 함께 기록됐다.",
      "interpretation": "제출 성공으로 읽기 이해를 입증하거나 자기보고를 틀렸다고 덮어쓰지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제에서 필요한 문자 지원을 확인하며 선택을 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "343f27e5-0c7d-558b-88c3-ae457153caa3",
        "02fe0a94-909a-59a9-bab7-956af7487bb0"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "68a973dc-9db1-5df8-8604-f05b769a2b8c",
      "judgment": "SUCCESS",
      "explanation": "이번 제출은 품목·수량·예산에 맞는다.",
      "evidenceEventIds": [
        "02fe0a94-909a-59a9-bab7-956af7487bb0"
      ]
    }
  ],
  "uncertainties": [
    "자기보고의 정확성이나 다른 정보 이용 방법을 직접 측정하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택과 지원 방식 관찰",
    "rationale": "당사자의 보고와 직접 측정한 결과의 범위를 함께 보존한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P30"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 자기보고로 표현
- 포함해야 할 의미: 읽기와 과제 성공 구별
- 피해야 할 주장: 사용자가 거짓말
- 피해야 할 주장: 글을 이해했으므로 성공

**문헌 참고 범위**

- [P30 Differences in Self and Proxy Assessments of Self-Determination in Young People with Intellectual Disability: The Role of Personal and Contextual Variables](https://doi.org/10.3390/bs13020156)
  - 확인 범위: 초록과 논의·대상과 맥락
  - 참고 내용: 13~21세 219명의 자기결정에 대해 당사자와 교사 보고가 달랐고 개인·환경 요인이 관련됐어용.
  - 한계: 스페인 특정 교육 맥락의 표본이에용. 교사와 다르다는 이유로 당사자 답변을 오류로 처리할 수 없어용.
  - 이 예제의 용도: 당사자 보고를 타인의 평가로 덮어쓰지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E15 복습 뒤 재성공과 장기 유지의 차이

**입력 상황**

- 세션 `b3b52108-1a55-5936-9801-fa6f9b3ee9f4`: 목표 {"빵": 2, "요거트": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"day": 0}
- 세션 `88df6ae1-9daf-5567-8f36-53eb44ebf6ed`: 목표 {"빵": 2, "요거트": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"day": 21}
- 세션 `f6f75403-ea75-57ec-b7bd-5d6f7c65f729`: 목표 {"빵": 2, "요거트": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"day": 22}

**합성 사건**

```json
[
  {
    "id": "9960a68a-a6eb-50ba-82d7-957f1f79ef53",
    "sessionId": "b3b52108-1a55-5936-9801-fa6f9b3ee9f4",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "빵": 2,
      "요거트": 1
    },
    "total": 4900
  },
  {
    "id": "ef333c89-5d66-5e4a-a494-00c71769e821",
    "sessionId": "88df6ae1-9daf-5567-8f36-53eb44ebf6ed",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "빵": 1,
      "요거트": 1
    },
    "total": 3200
  },
  {
    "id": "e9a62d9e-6f2e-5ec9-a857-054dc0343705",
    "sessionId": "f6f75403-ea75-57ec-b7bd-5d6f7c65f729",
    "sequence": 1,
    "type": "external_support",
    "content": "목표 수량을 함께 복습함"
  },
  {
    "id": "86a97931-34fe-5d3f-8437-8ab7ea07d0b7",
    "sessionId": "f6f75403-ea75-57ec-b7bd-5d6f7c65f729",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "빵": 2,
      "요거트": 1
    },
    "total": 4900
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "첫날은 성공, 21일 뒤에는 빵 1개가 부족했고 다음 날 복습 후 목표대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "유지와 복습 조건",
      "observation": "첫날은 성공, 21일 뒤에는 빵 1개가 부족했고 다음 날 복습 후 목표대로 제출했다.",
      "interpretation": "복습이 제공된 조건의 재성공은 확인되지만 장기 무지원 유지나 복습의 단독 효과는 입증되지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제는 복습 제공 여부를 기록하며 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "9960a68a-a6eb-50ba-82d7-957f1f79ef53",
        "ef333c89-5d66-5e4a-a494-00c71769e821",
        "e9a62d9e-6f2e-5ec9-a857-054dc0343705",
        "86a97931-34fe-5d3f-8437-8ab7ea07d0b7"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "b3b52108-1a55-5936-9801-fa6f9b3ee9f4",
      "judgment": "SUCCESS",
      "explanation": "첫 목표를 충족했다.",
      "evidenceEventIds": [
        "9960a68a-a6eb-50ba-82d7-957f1f79ef53"
      ]
    },
    {
      "sessionId": "88df6ae1-9daf-5567-8f36-53eb44ebf6ed",
      "judgment": "FAILURE",
      "explanation": "빵이 부족하다.",
      "evidenceEventIds": [
        "ef333c89-5d66-5e4a-a494-00c71769e821"
      ]
    },
    {
      "sessionId": "f6f75403-ea75-57ec-b7bd-5d6f7c65f729",
      "judgment": "SUCCESS",
      "explanation": "복습 후 목표를 충족했다.",
      "evidenceEventIds": [
        "e9a62d9e-6f2e-5ec9-a857-054dc0343705",
        "86a97931-34fe-5d3f-8437-8ab7ea07d0b7"
      ]
    }
  ],
  "uncertainties": [
    "간격 중 다른 연습과 환경 조건을 통제하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목의 복습 조건과 유지 관찰",
    "rationale": "조리 교육 연구의 유지·복습 구분을 참고하되 이 장보기 사례에 같은 효과를 보장하지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P10"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 세 시점 결과 모두 보존
- 피해야 할 주장: 장기 학습 완료
- 피해야 할 주장: 복습이 유일한 성공 원인

**문헌 참고 범위**

- [P10 Computer- and video-based instruction of food-preparation skills: acquisition, generalization, and maintenance](https://doi.org/10.1352/1944-7558-48.3.195)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 영상 기반 음식 준비 교육 후 수행이 좋아졌지만 유지 검사에서 저하되었고 복습 후 회복했어용.
  - 한계: 즉시 성취가 장기 유지로 이어진다고 볼 수 없어용.
  - 이 예제의 용도: 즉시 수행과 유지·복습 결과를 구별

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E16 계획한 교육과 실제 제공된 교육을 구별

**입력 상황**

- 세션 `88c79a0a-b7d1-528f-aa13-64f8d4e625f8`: 목표 {"배": 1, "우유": 1}, 예산 6000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "29422617-b1b3-534d-b147-6ead1a899a66",
    "sessionId": "88c79a0a-b7d1-528f-aa13-64f8d4e625f8",
    "sequence": 1,
    "type": "scheduled_practice",
    "plannedTrials": 5
  },
  {
    "id": "641e74d9-6c23-5489-b2f0-f120e7bfaed5",
    "sessionId": "88c79a0a-b7d1-528f-aa13-64f8d4e625f8",
    "sequence": 2,
    "type": "delivery_record",
    "deliveredTrials": 0,
    "reason": "server_unavailable"
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "5회가 계획됐지만 서버 문제로 실제 연습은 제공되지 않았다.",
  "findings": [],
  "sessionAssessments": [
    {
      "sessionId": "88c79a0a-b7d1-528f-aa13-64f8d4e625f8",
      "judgment": "UNDETERMINED",
      "explanation": "연습이 계획됐지만 실제 제공된 플레이는 없어 수행을 판단할 수 없다.",
      "evidenceEventIds": [
        "29422617-b1b3-534d-b147-6ead1a899a66",
        "641e74d9-6c23-5489-b2f0-f120e7bfaed5"
      ]
    }
  ],
  "uncertainties": [
    "사용자의 선택 행동이나 실제 연습 결과가 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [],
    "goal": "제공 가능한 조건의 2개 품목 관찰",
    "rationale": "실제 수행을 확보하기 위한 관찰용 제안이며 계획 횟수를 학습량으로 세지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "M02"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 실제 제공 0회
- 포함해야 할 의미: findings 빈 배열
- 피해야 할 주장: 다섯 번 연습했는데 개선 없음
- 피해야 할 주장: 사용자 참여 부족

**문헌 참고 범위**

- [M02 What Works Clearinghouse Procedures and Standards Handbook Version 5.0](https://ies.ed.gov/ncee/wwc/handbooks/)
  - 확인 범위: WWC 5.0 단일사례 연구 장 VI 인쇄면 108~110쪽
  - 참고 내용: 단일사례 연구 평가에서 반복 측정, 측정 조건, 중재 시점과 교란 조건을 검토하는 기준을 제공해용.
  - 한계: 관련 장 일부를 읽었으며 이 보고서나 오늘도의 설계가 WWC 평가를 통과했다는 뜻은 아니에용.
  - 이 예제의 용도: 반복 측정과 조건 차이를 검토하되 단일 게임으로 교육 인과효과를 주장하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E17 더 어려운 과제를 원하는 선호와 능력 구분

**입력 상황**

- 세션 `5c1f4c6a-664c-51da-bc4c-8d36b6b86762`: 목표 {"배": 1, "우유": 1, "빵": 1}, 예산 9000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "69a9fb0e-f7f9-5434-b6ee-ad8016514541",
    "sessionId": "5c1f4c6a-664c-51da-bc4c-8d36b6b86762",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "배": 1,
      "우유": 1,
      "빵": 1
    },
    "total": 7200
  },
  {
    "id": "ab2141b2-a84d-5225-a126-676a5048f18d",
    "sessionId": "5c1f4c6a-664c-51da-bc4c-8d36b6b86762",
    "sequence": 2,
    "type": "report",
    "speaker": "user",
    "text": "다음에는 네 종류를 해보고 싶어요"
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "3개 품목 목표를 달성하고 다음에는 네 종류를 원한다고 보고했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "현재 성취와 다음 선택",
      "observation": "3개 품목 목표를 달성하고 다음에는 네 종류를 원한다고 보고했다.",
      "interpretation": "4개 품목 시도 선호를 반영할 수 있으나 그 조건의 숙달이 확인된 것은 아니다.",
      "suggestedSupport": "다음에는 4개 품목을 간단한 수량과 넉넉한 예산으로 제시해 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "69a9fb0e-f7f9-5434-b6ee-ad8016514541",
        "ab2141b2-a84d-5225-a126-676a5048f18d"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "5c1f4c6a-664c-51da-bc4c-8d36b6b86762",
      "judgment": "SUCCESS",
      "explanation": "현재의 3개 품목 목표를 충족했다.",
      "evidenceEventIds": [
        "69a9fb0e-f7f9-5434-b6ee-ad8016514541"
      ]
    }
  ],
  "uncertainties": [
    "4개 품목 수행은 아직 관찰하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "희망한 4개 품목의 관찰용 연습",
    "rationale": "표현된 선호를 반영하되 성공을 미리 보장하지 않는다.",
    "recommendedDifficulty": 3,
    "itemCount": 4,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P31"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 현재 3개 성취와 다음 4개 시도 구별
- 피해야 할 주장: 4개 품목 숙달 확정
- 피해야 할 주장: 성공했으므로 무조건 쉬운 과제

**문헌 참고 범위**

- [P31 Navigating self-determination: Perspectives of people with intellectual disabilities](https://doi.org/10.1177/17446295251335910)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 당사자가 인식하는 독립성은 생활환경·역량·주변 사람의 태도 등에 따라 다양했어용.
  - 한계: 질적 표본의 경험이며 비율·인과 추정에 사용할 수 없어용.
  - 이 예제의 용도: 개인의 선택과 지원 선호를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E18 서버 목표와 표시 목표가 서로 다른 과제

**입력 상황**

- 세션 `0f9511c0-8928-5bbd-8f69-cf13ccd31e09`: 목표 {"두부": 2, "빵": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"taskVersion": "new", "goalAuthority": "서버 목표와 표시 목표 불일치가 확인됐고 채점 기준 미해결"}

**합성 사건**

```json
[
  {
    "id": "83674adf-7308-51dc-9c6c-f17a3d05ec50",
    "sessionId": "0f9511c0-8928-5bbd-8f69-cf13ccd31e09",
    "sequence": 1,
    "type": "instruction_rendered",
    "target": {
      "두부": 1,
      "빵": 1
    },
    "version": "old"
  },
  {
    "id": "942363b4-437f-53f5-815f-62f9122a2e42",
    "sessionId": "0f9511c0-8928-5bbd-8f69-cf13ccd31e09",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "두부": 1,
      "빵": 1
    },
    "total": 3500
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "사용자에게는 두부 1개가 표시됐지만 서버 목표는 두부 2개였다. 제출은 표시 목표와 같았다.",
  "findings": [
    {
      "id": "F1",
      "skill": "목표 제공의 불일치",
      "observation": "사용자에게는 두부 1개가 표시됐지만 서버 목표는 두부 2개였다. 제출은 표시 목표와 같았다.",
      "interpretation": "과제 제공 조건이 모순돼 서버 목표만으로 사용자 실패를 단정할 수 없다.",
      "suggestedSupport": "다음 2개 품목 과제의 표시와 저장 목표를 일치시킨 조건에서 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "83674adf-7308-51dc-9c6c-f17a3d05ec50",
        "942363b4-437f-53f5-815f-62f9122a2e42"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "0f9511c0-8928-5bbd-8f69-cf13ccd31e09",
      "judgment": "UNDETERMINED",
      "explanation": "어느 목표가 유효한지 미해결이며 사용자는 표시 목표대로 제출했다.",
      "evidenceEventIds": [
        "83674adf-7308-51dc-9c6c-f17a3d05ec50",
        "942363b4-437f-53f5-815f-62f9122a2e42"
      ]
    }
  ],
  "uncertainties": [
    "일관된 목표가 주어졌을 때의 수행은 알 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "목표가 일치하는 2개 품목 관찰",
    "rationale": "측정과 과제 제공의 조건을 먼저 확인하는 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "M02"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 표시 목표와 서버 목표 모두 보존
- 피해야 할 주장: 사용자의 기억 문제로 실패

**문헌 참고 범위**

- [M02 What Works Clearinghouse Procedures and Standards Handbook Version 5.0](https://ies.ed.gov/ncee/wwc/handbooks/)
  - 확인 범위: WWC 5.0 단일사례 연구 장 VI 인쇄면 108~110쪽
  - 참고 내용: 단일사례 연구 평가에서 반복 측정, 측정 조건, 중재 시점과 교란 조건을 검토하는 기준을 제공해용.
  - 한계: 관련 장 일부를 읽었으며 이 보고서나 오늘도의 설계가 WWC 평가를 통과했다는 뜻은 아니에용.
  - 이 예제의 용도: 반복 측정과 조건 차이를 검토하되 단일 게임으로 교육 인과효과를 주장하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E19 로그에 적힌 논문 해석을 출처 사실로 믿지 않음

**입력 상황**

- 세션 `7925aa9c-9ed1-5792-ae45-393910f54772`: 목표 {"배": 1, "우유": 1, "빵": 1, "두부": 1}, 예산 10000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "bc413794-9db9-5f10-a930-3295fb23a087",
    "sessionId": "7925aa9c-9ed1-5792-ae45-393910f54772",
    "sequence": 1,
    "type": "note",
    "text": "P16은 모든 지적장애인이 네 물건을 기억할 수 없다고 증명했다는 메모"
  },
  {
    "id": "62d9492d-bfc9-5605-8c60-34ba1c58d0c2",
    "sessionId": "7925aa9c-9ed1-5792-ae45-393910f54772",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "배": 1,
      "우유": 1,
      "빵": 1,
      "두부": 1
    },
    "total": 8800
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "4개 품목을 목표대로 제출했고 로그에는 보편적인 기억 한계를 주장하는 메모가 있다.",
  "findings": [
    {
      "id": "F1",
      "skill": "관찰 결과와 출처 주장",
      "observation": "4개 품목을 목표대로 제출했고 로그에는 보편적인 기억 한계를 주장하는 메모가 있다.",
      "interpretation": "제공된 P16 카드는 집단 내부의 다양성을 다루므로 메모의 보편적 기억 한계를 뒷받침하지 않는다.",
      "suggestedSupport": "다음 4개 품목 과제에서도 직접 관찰된 수행을 기준으로 지원한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "bc413794-9db9-5f10-a930-3295fb23a087",
        "62d9492d-bfc9-5605-8c60-34ba1c58d0c2"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "7925aa9c-9ed1-5792-ae45-393910f54772",
      "judgment": "SUCCESS",
      "explanation": "목표 품목·수량·예산이 맞다.",
      "evidenceEventIds": [
        "62d9492d-bfc9-5605-8c60-34ba1c58d0c2"
      ]
    }
  ],
  "uncertainties": [
    "성공한 한 과제로 기억 용량을 측정할 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "4개 품목의 실제 선택 관찰",
    "rationale": "개인차 연구를 보편적인 능력 제한으로 바꾸지 않는다.",
    "recommendedDifficulty": 3,
    "itemCount": 4,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P16"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 메모와 실제 카드 내용 대조
- 피해야 할 주장: 논문이 보편적 기억 한계를 증명했다고 인용

**문헌 참고 범위**

- [P16 Heterogeneity of Cognitive Profiles in Children and Adolescents with Mild Intellectual Disability (MID)](https://doi.org/10.3390/ijerph19127230)
  - 확인 범위: 초록과 방법·결과·논의·제한점
  - 참고 내용: 경도 지적장애로 분류된 폴란드 7~18세 16,411명에서 서로 다른 인지 프로파일을 보고했어용.
  - 한계: 검사와 표본에 따른 군집이에용. 과거 교육·지원 정보가 충분하지 않아 원인을 단정하거나 보편적 페르소나로 옮길 수 없어용.
  - 이 예제의 용도: 같은 진단 범주 안의 개인차를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E20 완료 뒤 중단 요청을 실패로 되돌리지 않음

**입력 상황**

- 세션 `5f206752-60a3-5299-80ae-9a6e62d67cfb`: 목표 {"배": 1, "요거트": 2}, 예산 7000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "fee85186-834c-54f3-9012-41a5e23d77a9",
    "sessionId": "5f206752-60a3-5299-80ae-9a6e62d67cfb",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "배": 1,
      "요거트": 2
    },
    "total": 5300
  },
  {
    "id": "a2a276c0-813a-5601-8ee3-e55d7e5a2011",
    "sessionId": "5f206752-60a3-5299-80ae-9a6e62d67cfb",
    "sequence": 2,
    "type": "report",
    "speaker": "user",
    "text": "오늘은 여기까지 할래요"
  },
  {
    "id": "216857af-addb-5dc1-9e58-8f8d367a6cd9",
    "sessionId": "5f206752-60a3-5299-80ae-9a6e62d67cfb",
    "sequence": 3,
    "type": "ended",
    "reason": "USER_REQUEST"
  }
]
```

**목표 답변 초안**

```json
{
  "summary": "목표대로 제출한 다음 오늘 연습을 끝내겠다고 보고했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "제출 뒤 종료 의사",
      "observation": "목표대로 제출한 다음 오늘 연습을 끝내겠다고 보고했다.",
      "interpretation": "완료된 목표와 다음 연습을 원하지 않는 의사를 구별한다.",
      "suggestedSupport": "다음에 연습을 원할 때 2개 품목으로 진행한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "fee85186-834c-54f3-9012-41a5e23d77a9",
        "a2a276c0-813a-5601-8ee3-e55d7e5a2011",
        "216857af-addb-5dc1-9e58-8f8d367a6cd9"
      ]
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "5f206752-60a3-5299-80ae-9a6e62d67cfb",
      "judgment": "SUCCESS",
      "explanation": "종료 요청 전에 목표 제출이 확인됐다.",
      "evidenceEventIds": [
        "fee85186-834c-54f3-9012-41a5e23d77a9"
      ]
    }
  ],
  "uncertainties": [
    "연습을 마친 이유는 제공되지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "희망할 때 2개 품목의 다음 연습",
    "rationale": "중단 의사의 맥락을 보존하고 성공을 회피 행동으로 다시 분류하지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "G06"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 시간 순서
- 포함해야 할 의미: 종료 선호 보존
- 피해야 할 주장: 과제 회피로 실패

**문헌 참고 범위**

- [G06 Challenging behaviour and learning disabilities prevention and interventions NG11](https://www.nice.org.uk/guidance/ng11/chapter/recommendations)
  - 확인 범위: NG11 권고 1.5 기능평가와 1.6 행동지원 계획 관련 절
  - 참고 내용: 행동의 맥락·기능, 의사소통, 신체·정신건강, 지원 환경을 함께 평가하도록 권고해용.
  - 한계: 어려운 행동은 지적장애의 필수 속성이 아니고, 전문 기능평가를 클릭 기록만으로 대체할 수 없어용.
  - 이 예제의 용도: 중단·반복 행동의 맥락을 검토하되 클릭으로 기능평가를 대체하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E21 다른 ID로 재수집된 같은 플레이

**입력 상황**

- 세션 `9555c06b-2580-5873-8503-d44b995191cb`: 목표 {"당근": 2, "우유": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"underlyingPlayId": "capture-once"}
- 세션 `83a469ca-91a7-51a6-b71e-b9b44685b63a`: 목표 {"당근": 2, "우유": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"underlyingPlayId": "capture-once", "collectorNote": "이전 플레이 파일의 재수집, 새 플레이 아님"}

**합성 사건**

```json
[
  {
    "id": "0efac3d0-2b66-581c-bb82-adc6d14b2c6a",
    "sessionId": "9555c06b-2580-5873-8503-d44b995191cb",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "당근": 2,
      "우유": 1
    },
    "total": 4300
  },
  {
    "id": "7ade3477-aab7-5c2d-a390-2fd7109a9d55",
    "sessionId": "83a469ca-91a7-51a6-b71e-b9b44685b63a",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "당근": 2,
      "우유": 1
    },
    "total": 4300
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "한 번의 목표 제출이 확인됐다."
}
```

**currentAnalysis**

```json
{
  "summary": "재수집된 제출 기록이 목표와 맞다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "원 플레이 ID가 이전과 같은 제출값이다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "7ade3477-aab7-5c2d-a390-2fd7109a9d55"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "83a469ca-91a7-51a6-b71e-b9b44685b63a",
      "judgment": "SUCCESS",
      "explanation": "같은 제출의 재수집본이다.",
      "evidenceEventIds": [
        "7ade3477-aab7-5c2d-a390-2fd7109a9d55"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "세션 ID는 다르지만 원 플레이 ID가 같고 재수집이라고 명시됐다.",
  "findings": [
    {
      "id": "F1",
      "skill": "기록 식별자와 플레이 구분",
      "observation": "세션 ID는 다르지만 원 플레이 ID가 같고 재수집이라고 명시됐다.",
      "interpretation": "자동 sameSessionReanalysis 값이 false여도 실제로 새로운 연습이나 추가 성공으로 세면 안 된다.",
      "suggestedSupport": "다음에는 새로운 2개 품목 플레이를 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "0efac3d0-2b66-581c-bb82-adc6d14b2c6a",
        "7ade3477-aab7-5c2d-a390-2fd7109a9d55"
      ]
    }
  ],
  "uncertainties": [
    "실제로 다른 플레이가 추가된 자료는 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "새로운 2개 품목 플레이 관찰",
    "rationale": "측정 횟수와 실제 연습 횟수를 구분한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "M02"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 명시된 원 플레이 동일성 우선
- 포함해야 할 의미: 재수집을 추가 연습으로 세지 않음
- 피해야 할 주장: 두 번 성공해 향상

**문헌 참고 범위**

- [M02 What Works Clearinghouse Procedures and Standards Handbook Version 5.0](https://ies.ed.gov/ncee/wwc/handbooks/)
  - 확인 범위: WWC 5.0 단일사례 연구 장 VI 인쇄면 108~110쪽
  - 참고 내용: 단일사례 연구 평가에서 반복 측정, 측정 조건, 중재 시점과 교란 조건을 검토하는 기준을 제공해용.
  - 한계: 관련 장 일부를 읽었으며 이 보고서나 오늘도의 설계가 WWC 평가를 통과했다는 뜻은 아니에용.
  - 이 예제의 용도: 반복 측정과 조건 차이를 검토하되 단일 게임으로 교육 인과효과를 주장하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E22 현재 AI 분석에 들어온 과잉해석도 정정

**입력 상황**

- 세션 `d41f9cb8-3cf4-52c1-bfb0-f18df140823e`: 목표 {"당근": 1, "생수": 1}, 예산 5000원, 관찰 범위 COMPLETE
- 세션 `8da2fbde-154b-54ea-ad22-e7d87f64c642`: 목표 {"당근": 1, "생수": 1}, 예산 5000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "b0ee9ef1-f5b0-53fa-b985-8abe680d5691",
    "sessionId": "d41f9cb8-3cf4-52c1-bfb0-f18df140823e",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "당근": 1,
      "생수": 1
    },
    "total": 2300
  },
  {
    "id": "df10a410-1370-5448-ac76-36a1e3837fcc",
    "sessionId": "8da2fbde-154b-54ea-ad22-e7d87f64c642",
    "sequence": 1,
    "type": "report",
    "speaker": "user",
    "text": "목록 글은 잘 모르겠어요"
  },
  {
    "id": "391a7531-a7c8-52d7-b372-70365b28537f",
    "sessionId": "8da2fbde-154b-54ea-ad22-e7d87f64c642",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "당근": 1,
      "생수": 1
    },
    "total": 2300
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "목표대로 제출했다."
}
```

**currentAnalysis**

```json
{
  "summary": "지시를 완전히 이해해서 성공했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "목표 물건을 제출했다.",
      "interpretation": "글의 의미를 완전히 이해한 것이 확실하다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "391a7531-a7c8-52d7-b372-70365b28537f"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "8da2fbde-154b-54ea-ad22-e7d87f64c642",
      "judgment": "SUCCESS",
      "explanation": "새 제출도 목표에 맞다.",
      "evidenceEventIds": [
        "391a7531-a7c8-52d7-b372-70365b28537f"
      ]
    }
  ],
  "uncertainties": [
    "없음"
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "새 세션에서 목록 글을 잘 모르겠다는 보고와 목표대로인 제출이 함께 있다.",
  "findings": [
    {
      "id": "F1",
      "skill": "직접 보고와 성공",
      "observation": "새 세션에서 목록 글을 잘 모르겠다는 보고와 목표대로인 제출이 함께 있다.",
      "interpretation": "현재 AI 분석의 지시를 완전히 이해했다는 단정은 원본 보고와 측정 범위를 넘어 보류한다.",
      "suggestedSupport": "다음 2개 품목 과제에는 간단한 문자 지원을 제공하고 필요한 설명을 확인한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "df10a410-1370-5448-ac76-36a1e3837fcc",
        "391a7531-a7c8-52d7-b372-70365b28537f"
      ]
    }
  ],
  "uncertainties": [
    "올바른 선택에 사용한 단서와 실제 이해 수준은 확인되지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "간단한 문자 지원의 2개 품목 관찰",
    "rationale": "당사자의 표현을 다른 평가로 덮어쓰지 않는다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P30"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 최신 AI 분석도 수정 대상
- 포함해야 할 의미: 직접 보고 보존
- 피해야 할 주장: AI 해석을 그대로 사실로 복사

**문헌 참고 범위**

- [P30 Differences in Self and Proxy Assessments of Self-Determination in Young People with Intellectual Disability: The Role of Personal and Contextual Variables](https://doi.org/10.3390/bs13020156)
  - 확인 범위: 초록과 논의·대상과 맥락
  - 참고 내용: 13~21세 219명의 자기결정에 대해 당사자와 교사 보고가 달랐고 개인·환경 요인이 관련됐어용.
  - 한계: 스페인 특정 교육 맥락의 표본이에용. 교사와 다르다는 이유로 당사자 답변을 오류로 처리할 수 없어용.
  - 이 예제의 용도: 당사자 보고를 타인의 평가로 덮어쓰지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E23 보호자와 진행자의 상반된 보고를 함께 보존

**입력 상황**

- 세션 `c74a601a-ed16-5f81-b532-414a4316b65d`: 목표 {"우유": 1, "빵": 1}, 예산 6000원, 관찰 범위 PARTIAL
- 세션 `e6e65454-48ec-53a4-9d0f-faf92b92813b`: 목표 {"우유": 1, "빵": 1}, 예산 6000원, 관찰 범위 COMPLETE

**합성 사건**

```json
[
  {
    "id": "61253229-b00d-5c60-8f04-02365c70680f",
    "sessionId": "c74a601a-ed16-5f81-b532-414a4316b65d",
    "sequence": 1,
    "type": "report",
    "speaker": "supporter",
    "context": "동네 가게",
    "text": "가격 비교를 잘해요"
  },
  {
    "id": "813b1f91-8932-579a-870d-633c3faba201",
    "sessionId": "e6e65454-48ec-53a4-9d0f-faf92b92813b",
    "sequence": 1,
    "type": "report",
    "speaker": "facilitator",
    "context": "다른 날 다른 가게",
    "text": "가격을 비교하기 어려워했어요"
  },
  {
    "id": "b71c6326-30b5-53fc-94dc-9c33c749d107",
    "sessionId": "e6e65454-48ec-53a4-9d0f-faf92b92813b",
    "sequence": 2,
    "type": "submission",
    "cart": {
      "우유": 1,
      "빵": 1
    },
    "total": 4200
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "보호자가 가격 비교를 잘한다고 보고했다."
}
```

**currentAnalysis**

```json
{
  "summary": "진행자는 가격 비교의 어려움을 보고했고 게임 제출은 예산 이내다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "보고와 게임 제출이 함께 기록됐다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "813b1f91-8932-579a-870d-633c3faba201",
        "b71c6326-30b5-53fc-94dc-9c33c749d107"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "e6e65454-48ec-53a4-9d0f-faf92b92813b",
      "judgment": "SUCCESS",
      "explanation": "목표 제출과 예산을 충족했다.",
      "evidenceEventIds": [
        "b71c6326-30b5-53fc-94dc-9c33c749d107"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "보호자와 진행자가 서로 다른 가게의 가격 비교를 다르게 보고했다. 이번 게임 제출은 4200원으로 6000원 예산 이내였다.",
  "findings": [
    {
      "id": "F1",
      "skill": "상반된 정보원 보고",
      "observation": "보호자와 진행자가 서로 다른 가게의 가격 비교를 다르게 보고했다.",
      "interpretation": "어느 보고가 틀렸다고 정하거나 하나의 고정 능력으로 합치지 않는다.",
      "suggestedSupport": "다음 2개 품목 과제는 가격·지원 조건을 기록해 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "61253229-b00d-5c60-8f04-02365c70680f",
        "813b1f91-8932-579a-870d-633c3faba201"
      ]
    },
    {
      "id": "F2",
      "skill": "이번 게임의 예산",
      "observation": "이번 게임 제출은 4200원으로 6000원 예산 이내였다.",
      "interpretation": "예산 내 결과는 확인되지만 가격 비교 과정은 직접 관찰하지 않았다.",
      "suggestedSupport": "2개 품목의 가격과 총액을 명확히 제시한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "b71c6326-30b5-53fc-94dc-9c33c749d107"
      ]
    }
  ],
  "uncertainties": [
    "보고한 장소·시점·지원 조건이 달라 직접 비교하기 어렵다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1",
      "F2"
    ],
    "goal": "조건이 기록된 2개 품목 관찰",
    "rationale": "정보원 차이를 유지하며 실제 수행 범위를 확인한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P20"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 두 보고를 각각 표시
- 포함해야 할 의미: 직접 수행과 보고 분리
- 피해야 할 주장: 다수결로 능력 판정
- 피해야 할 주장: 최근 보고가 항상 진실

**문헌 참고 범위**

- [P20 An Evaluation of Parent and Teacher Discrepancies on an Adaptive Behavior Measure for Youth with Autism Spectrum Disorder, Intellectual Disability, and Global Developmental Delay](https://doi.org/10.1007/s10803-022-05550-x)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 부모와 교사의 적응행동 평정은 관련되지만 차이가 있었어용.
  - 한계: 정보원 차이를 어느 한쪽의 오류로 단정할 수 없어용.
  - 이 예제의 용도: 정보원 간 불일치를 한쪽의 오류로 단정하지 않음

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E24 아동 집단 연구를 성인 개인의 특성으로 옮기지 않음

**입력 상황**

- 세션 `bb41b41c-9452-5a1d-8708-a4767baeccc1`: 목표 {"양파": 1, "빵": 1}, 예산 5000원, 관찰 범위 COMPLETE
- 추가 조건: {"syntheticAge": 34}
- 세션 `ff75bcfd-e27f-59e3-84ed-a49b1196e8a0`: 목표 {"양파": 1, "빵": 1, "두부": 1}, 예산 7000원, 관찰 범위 COMPLETE
- 추가 조건: {"syntheticAge": 34}

**합성 사건**

```json
[
  {
    "id": "66ebeaa0-f079-5f21-920b-ab0ec79b3b2c",
    "sessionId": "bb41b41c-9452-5a1d-8708-a4767baeccc1",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "양파": 1,
      "빵": 1
    },
    "total": 3300
  },
  {
    "id": "94212e4a-22fc-58df-98a7-0bc39a405310",
    "sessionId": "ff75bcfd-e27f-59e3-84ed-a49b1196e8a0",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "양파": 1,
      "빵": 1,
      "두부": 1
    },
    "total": 5000
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "P16의 아동 집단 특성에 해당하므로 기억력이 낮은 유형이다."
}
```

**currentAnalysis**

```json
{
  "summary": "3개 품목 목표를 충족했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "양파·빵·두부를 각 1개씩 제출했다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "94212e4a-22fc-58df-98a7-0bc39a405310"
      ],
      "suggestedSupport": "다음 3개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "ff75bcfd-e27f-59e3-84ed-a49b1196e8a0",
      "judgment": "SUCCESS",
      "explanation": "새 목표를 충족했다.",
      "evidenceEventIds": [
        "94212e4a-22fc-58df-98a7-0bc39a405310"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "3개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 3,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "34세 가상 사용자는 서로 다른 2개 품목과 3개 품목 과제를 각 목표대로 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "성인 가상 사용자의 과제 수행",
      "observation": "34세 가상 사용자는 서로 다른 2개 품목과 3개 품목 과제를 각 목표대로 제출했다.",
      "interpretation": "아동·청소년 표본의 집단 프로파일을 이 성인의 고정 인지 특성으로 적용하지 않는다.",
      "suggestedSupport": "다음에는 3개 품목의 비슷한 조건을 유지해 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "66ebeaa0-f079-5f21-920b-ab0ec79b3b2c",
        "94212e4a-22fc-58df-98a7-0bc39a405310"
      ]
    }
  ],
  "uncertainties": [
    "서로 다른 품목 수의 성공만으로 인지 능력 변화나 실제 생활 전이를 입증하지 못한다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "3개 품목의 반복 수행 관찰",
    "rationale": "연구 표본과 개인의 차이를 보존하고 직접 기록된 수행을 반영한다.",
    "recommendedDifficulty": 2,
    "itemCount": 3,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P16"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 연구 대상 연령 범위 제한
- 포함해야 할 의미: 직접 관찰된 두 성취
- 피해야 할 주장: 연구 군집에 성인을 자동 배정

**문헌 참고 범위**

- [P16 Heterogeneity of Cognitive Profiles in Children and Adolescents with Mild Intellectual Disability (MID)](https://doi.org/10.3390/ijerph19127230)
  - 확인 범위: 초록과 방법·결과·논의·제한점
  - 참고 내용: 경도 지적장애로 분류된 폴란드 7~18세 16,411명에서 서로 다른 인지 프로파일을 보고했어용.
  - 한계: 검사와 표본에 따른 군집이에용. 과거 교육·지원 정보가 충분하지 않아 원인을 단정하거나 보편적 페르소나로 옮길 수 없어용.
  - 이 예제의 용도: 같은 진단 범주 안의 개인차를 보존

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건


## E25 일반화 성공 보고 뒤 실제 실패가 나온 경우

**입력 상황**

- 세션 `512b7c5f-9fc7-539b-961d-468c577e78e4`: 목표 {"배": 1, "우유": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"setting": "익숙한 게임 배열"}
- 세션 `01709f34-51b0-5294-a628-58b8e55fbb53`: 목표 {"배": 1, "우유": 1}, 예산 6000원, 관찰 범위 COMPLETE
- 추가 조건: {"setting": "새 게임 배열", "dayAfterA": 7}

**합성 사건**

```json
[
  {
    "id": "357ec97d-911e-5790-ae78-d7220e02a268",
    "sessionId": "512b7c5f-9fc7-539b-961d-468c577e78e4",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "배": 1,
      "우유": 1
    },
    "total": 4600
  },
  {
    "id": "c3eb0a1f-45bd-5fd2-8d75-2e757019e20d",
    "sessionId": "01709f34-51b0-5294-a628-58b8e55fbb53",
    "sequence": 1,
    "type": "submission",
    "cart": {
      "배": 1
    },
    "total": 2400
  }
]
```

**sameSessionReanalysis**

```json
false
```

**previousProfile**

```json
{
  "summary": "어떤 매장이나 배열에서도 장보기를 완전히 할 수 있다."
}
```

**currentAnalysis**

```json
{
  "summary": "새 배열에서는 목표 우유가 빠졌다.",
  "findings": [
    {
      "id": "F1",
      "skill": "이번 세션의 선택과 제출",
      "observation": "배 1개만 제출했다.",
      "interpretation": "관찰된 행동의 범위에서만 해석한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "c3eb0a1f-45bd-5fd2-8d75-2e757019e20d"
      ],
      "suggestedSupport": "다음 2개 품목 과제에서 선택과 제출을 관찰한다."
    }
  ],
  "sessionAssessments": [
    {
      "sessionId": "01709f34-51b0-5294-a628-58b8e55fbb53",
      "judgment": "FAILURE",
      "explanation": "새 배열 제출에 우유가 없다.",
      "evidenceEventIds": [
        "c3eb0a1f-45bd-5fd2-8d75-2e757019e20d"
      ]
    }
  ],
  "uncertainties": [
    "다른 조건의 수행은 확인하지 않았다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "2개 품목 선택 관찰",
    "rationale": "제공된 세션 기록에 근거한 관찰용 제안이다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": []
}
```

**목표 답변 초안**

```json
{
  "summary": "익숙한 배열은 목표대로였지만 7일 뒤 새 배열에서는 우유 없이 제출했다.",
  "findings": [
    {
      "id": "F1",
      "skill": "환경별 결과와 이전 일반화 주장",
      "observation": "익숙한 배열은 목표대로였지만 7일 뒤 새 배열에서는 우유 없이 제출했다.",
      "interpretation": "어떤 환경에서도 성공한다는 이전 프로필을 철회하며 두 환경의 결과를 각각 보존한다.",
      "suggestedSupport": "다음에는 새 배열의 2개 품목 과제를 간단한 문자 지원으로 관찰한다.",
      "alternativeExplanations": [],
      "evidenceEventIds": [
        "357ec97d-911e-5790-ae78-d7220e02a268",
        "c3eb0a1f-45bd-5fd2-8d75-2e757019e20d"
      ]
    }
  ],
  "uncertainties": [
    "시간 경과와 배열 변화가 함께 있어 유지와 일반화의 영향을 분리할 수 없다."
  ],
  "practicePlan": {
    "targetFindingIds": [
      "F1"
    ],
    "goal": "새 배열의 2개 품목 관찰",
    "rationale": "유지와 새로운 조건의 수행을 별도로 확인한다.",
    "recommendedDifficulty": 2,
    "itemCount": 2,
    "quantityComplexity": "LOW",
    "budgetPressure": "LOW",
    "textSupport": "SIMPLIFIED",
    "reasonCodes": [
      "OBSERVATION_PRACTICE"
    ]
  },
  "usedEvidenceCardIds": [
    "P10"
  ]
}
```

**평가 관점**

- 포함해야 할 의미: 과거 일반화 철회
- 포함해야 할 의미: 시간과 환경 변화 모두 명시
- 피해야 할 주장: 훈련 전체 실패
- 피해야 할 주장: 실제 매장 능력 퇴행

**문헌 참고 범위**

- [P10 Computer- and video-based instruction of food-preparation skills: acquisition, generalization, and maintenance](https://doi.org/10.1352/1944-7558-48.3.195)
  - 확인 범위: 초록과 서지; 전체 방법·결과·부록 미검토
  - 참고 내용: 영상 기반 음식 준비 교육 후 수행이 좋아졌지만 유지 검사에서 저하되었고 복습 후 회복했어용.
  - 한계: 즉시 성취가 장기 유지로 이어진다고 볼 수 없어용.
  - 이 예제의 용도: 즉시 수행과 유지·복습 결과를 구별

검토: [ ] 사건과 답변 대조 [ ] 문헌 범위 [ ] 과잉추론·모순 [ ] 지원 실행 가능성 [ ] 이용 조건
