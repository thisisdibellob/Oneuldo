# 이번 변경

수정 파일: `backend/src/main/java/oneuldo/behaviorlog/analysis/service/AiBehaviorAnalysisPromptFactory.java`

- 프롬프트 버전을 `behavior-analysis-v17-market-event-semantics`로 올렸다.
- 구간 관찰·중간 통합의 시스템 지시에 수집 코드의 의미를 추가했다.
- `SHOP.ITEM_SEARCH_STARTED`와 `MOVE_IN_MARKET` 조합은 이동 시작/재시작 때 자동 기록되며 검색창 사용의 증거가 아니라고 명시했다.
- 게임 분류 코드의 명칭을 명시했다: produce=과일(채소 포함), fresh=냉장 식품, drink=음료, meal=간편 식품.
- 상품 위치는 해당 플레이의 categoryId를 확인하도록 했다. 특정 품목의 위치를 정답으로 주입하지 않았다.

근거: `frontend/src/behavior/marketMovementDetector.ts`의 이동 시작 분기와 `frontend/src/game/scenarios.ts`의 marketCategories.

# 비교 조건

같은 E112–E154, 43개 사건을 사용했다. 전 시험의 사용자 입력 프롬프트와 시스템 지시가 일치하는지 먼저 assertion으로 검증한 뒤 위 설명만 덧붙였다. 모델, JSON Schema, 온도, 8K 문맥, 출력 상한 1800을 유지했다. 시간·금액 계산값 생성, 로그 축약은 이번 변경에 포함하지 않았다.

운영 반영 여부와 별개로 같은 노트북의 내부 전용 임시 게이트웨이를 통해 실제 27B 모델을 호출했다. 전체 세션이나 프로젝트 전체 API 흐름을 재분석한 것은 아니다.
