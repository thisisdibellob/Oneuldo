# 기초 2회·추천 3회 실제 페르소나 테스트

실행일: 2026-10-12. 가상 성인 민재 v2가 실제 앱의 키보드·버튼을 조작한 5회다. 사람 참가자나 임상적 학습 검증이 아니다. **기초1 → 추천1 → 추천2 → 추천3 → 동일 기초2** 순서로 실행했다. 실제 세션5개와 분석·프로필5개가 모두 완료됐다.

## 결과

| 회차 | 정확한 목표 상품·수량 | AI 판정 | 게임 경과 / 제한 | 원본 사건 | AI 분석 시간 |
|---|---:|---|---:|---:|---:|
| 기초 1 | 3/4종 | 실패 | 4분 02초 / 10분 | 407개 | 9분 55초 |
| 추천 1 | 2/2종 | 성공 | 3분 01초 / 5분 | 363개 | 6분 23초 |
| 추천 2 | 2/2종 | 성공 | 1분 54초 / 5분 | 256개 | 6분 26초 |
| 추천 3 | 2/2종 | 성공 | 2분 10초 / 5분 | 281개 | 6분 59초 |
| 기초 2(재검사) | 4/4종 | 성공 | 6분 58초 / 10분 | 434개 | 8분 12초 |

기초1에서는 우유900mL2개 대신 작은우유200mL2개를 제출했고, 바나나·즉석밥·생수는 맞았다. 추천3회는 우유900mL2개와 바나나1송이2송이를 모두 맞췄다. 기초2에서는 우유900mL2개·바나나2송이·즉석밥210g3개입2개·생수500mL3개를 맞췄다. 마지막 합계는23,000원/예산26,000원이다. 모든 세션은 시간 내 FLOW_FINISHED다.

게임 경과는 실제 WALL_CLOCK이며 도구/관찰 지연도 포함된다. 기초2에는 배우 문맥 복원 관련 약2분 대기가 포함됐고 일반 이용 도움말을1회 열었다. 시간 차이를 인지 속도나 학습 능력으로 해석하지 않는다. AI 분석 시간은 관찰·종합·검토·수정을 포함하며 이후 프로필 갱신 시간과는 다르다.

## 추천 성공을 해석할 때 필요한 조건

- 세 추천 모두 목표가4종에서2종으로 줄었고, ‘작은 우유(200mL)나 낱개 바나나는 목표가 아닙니다’라는 직접적인 제외 안내를 제공했다. 세 추천의 목표·브리핑·재고·시간·배치·인원은 동일했다.
- 서로 다른 생성ID와 직전 최신 프로필로 새 과제를 생성했고 서로 다른 실제 세션을 플레이했다. 캐시 결과나 같은 로그를 새 플레이로 세지 않았다.
- 마지막 기초는 첫기초와 mission/products/slots/geometry/runtimeConfig가 모두 동일했다. 원래 네 품목 조건에서 우유 선택이200mL→900mL로 바뀐 것은 관찰됐지만, 같은 상품을 반복한 실험 내 재검사다. 장기 유지·새 상품 전이·독립 숙달을 입증하지 않는다.
- 이번 표본에서 무조건 성공으로 잘못 판정하는 현상은 확인되지 않았다. 첫 실제 불일치는 실패였다. 대신 **같은 직접 안내를 유지한 쉬워진 추천에서 연속 성공하고, AI가 그 성공을 능력으로 과대 해석하는 현상**이 확인됐다.

## 매대와 환경 변경

AI는 세 번 모두 기존 `classic` 구조를 선택했다. 첫추천에서 상품 분류별 위치를 교환했고 추천2·3은 그대로 유지했다. 통로형 `aisles`나 코너형 `corner`로 구조를 바꾸지는 않았다. 마지막 기초는 원래 배치를 정확히 복원했다.

| 상품 분류 | 기초1·기초2 위치 | 추천1·2·3 위치 |
|---|---|---|
| 음료 | 위쪽 왼편 | 가운데 구역 오른편 |
| 간편식품 | 위쪽 오른편 | 가운데 구역 중앙 |
| 생활용품 | 가운데 구역 왼편 | 동일 |
| 냉장식품 | 가운데 구역 중앙 | 위쪽 오른편 |
| 과일·채소 | 가운데 구역 오른편 | 위쪽 왼편 |

| 조건 | 기초1·2 | 추천1·2·3 |
|---|---:|---:|
| 직원 / 손님 | 1 / 1명 | 2 / 2명 |
| 유인 계산원 | 2명 | 1명 |
| 기둥 / 의자 | 1 / 0개 | 1 / 0개 |
| 상품별 재고 | 6개 | 5개 |
| 제한 시간 | 600초 | 300초 |
| 목표 / 예산 | 4종 / 26,000원 | 2종 / 11,600원 |
| 품절 / 계산 내역 | 품절 없음 / 정상 | 품절 없음 / 정상 |

수동 잠금은 없었고 AI가 위 조건을 선택했다. 이번5회에서 자율적인 품절·오청구·새 배치 구조 선택은 관찰되지 않았다. 화면뿐 아니라 실제 sceneSnapshot의 매대 좌표·인원·runtimeConfig를 대조했다.

## 중요한 문제와 개선 우선순위

1. **지원받은 성공과 독립 수행을 구분해야 한다.** 추천1 분석은 ‘규격 구별 능력을 입증’, 추천2는 ‘현재 규격 구별 능력은 충분’하다는 해석과 추가 지원 축소 가능성을 제시했다. 직접 배제 안내가 계속 있었음을 결론에 반영해야 한다. 다음 관찰의 목적과 지원 조건을 명시하고, 같은 도움을 받은 반복 성공을 숙달로 자동 승격하지 않아야 한다. 마지막 기초에서는 HUD에 네 번째 생수 목표가 보이지 않아 배우가 일반 도움말을 열었지만, AI에는 화면 가시성 원인이 전달되지 않았다. AI가 제안한 ‘도움말 없는 수행’을 적용하기 전에 목표 목록의 가시성을 확인하고 조작 도움과 과제별 지원을 구분할 필요가 있다.
2. **새 추천의 실제 변화와 근거 설명을 함께 검증해야 한다.** 추천3의 사유는 EXPLORE_CATEGORY_VARIETY지만 상품·조건은 이전과 같다. 설명에 ‘바나나 추가’, 이미 지난 우유 오류, 총비용10,000원이라는 문장이 반복됐다. 실제합계·예산은11,600원이다. 최초추천에서 매대 위치와 사람 수를 바꾸면서 ‘공간 변수를 통제’했다고 설명했고, 차단 원인·경로 효율을 원본 이상으로 해석한 부분도 있다. 최신 원본과 실제 설정 차이를 우선하고, 계산·변경 설명을 동일한 확정값으로 검사할 필요가 있다.
3. **생성·분석의 안정성과 대기 시간을 줄여야 한다.** 첫추천 검토 오류와 두번째추천 입력초과를 재현했다. 입력초과는 이번에 원본 보존 방식으로 수정했고 후속 두 추천이 완료됐다. 다만 한도 여유는 제한적이고 분석 한 회는 수분이 걸렸다. 누적 이력·긴 플레이를 포함한 요청 크기 회귀 검사를 유지하고, 원본을 삭제하거나 검토를 우회하는 방식으로 지연을 줄여서는 안 된다.

## 생성 실패·수정·검증

| 생성 시도 | 결과 | 시간 | 버전 |
|---|---|---:|---|
| 추천1 첫 시도 | AI_QUEST_UNAVAILABLE | 242.4초 | market-ai-quest-v60-adaptive-world |
| 추천1 재시도 | 완료 | 137.5초 | market-ai-quest-v60-adaptive-world |
| 추천2 첫 시도 | INPUT_TOO_LARGE | 57.9초 | market-ai-quest-v60-adaptive-world |
| 추천2 수정 후 재시도 | 완료 | 160.9초 | market-ai-quest-v61-shared-history |
| 추천3 | 완료 | 196.9초 | market-ai-quest-v61-shared-history |

첫추천의10,000원 예산은 실제최소비용11,600원보다 작아 차단됐다. 수정후 검토에서 존재하지 않는 `/changeReasons` 경로가 나와 실패했고 재시도에서 완료됐다. 상태는 종료됐으므로 무한생성이 아니라 검토 실패였다.

추천2의 최초 요청은24,464토큰으로24,000한도를 넘었다. `AdaptiveQuestTransport`를 추가해 현재 원본 근거와 과거 이력을 하나의 무손실 표현으로 전송한다. 좌표·시각·상품·수량은 복원 후 원본과 같고, 읽기용 행동표·제약·출력 스키마·검토 후보·인용 원문은 직접 읽을 수 있게 유지했다. 원본 로그를 변경하지 않았다.

수정후 실제 추천2의 생성23,336토큰/검토23,417토큰으로 완료됐다. 세 추천 과정에서 실제 전송된15개요청을 원문으로 재계산한 최대값은23,840토큰(출력상한·여유 포함)이다. 한도 초과로 전송하지 못한 요청은 이15개에 포함하지 않는다. 모델 문맥24,576·요청예산24,000·생성전체최대300초는 유지했다.

검사30개 통과(계약10·무손실 인코딩17·새 전송/실제기록 회귀3), 실패·건너뜀0. 서버 빌드 통과. 첫 두 실제플레이는v60, 추천2부터 생성경로는v61-shared-history다. UI·기초고정조건·행동원본은 유지했고 버전변경은 `implementation-change-v61.json`에 남겼다. 분석 프롬프트는 이번 수정 대상이 아니었다.

마지막 기초 AI는 네 목표와 예산을 정확히 판정하고 도움말 사용 동기를 ‘미확인’으로 남겼다. 다만 완료된 선반 방문만으로 ‘이동하는 데 어려움이 없었다’고 해석한 부분은 원본보다 강하다. 다음 계획은4품목·난이도2를 유지하면서 도움말 없는 수행을 제안했다. 실제 다음 퀘스트를 추가로 생성하거나 플레이하지는 않았다.

## 기록과 실행 한계

격리 DB `oneuldo_pilot_adaptive_20261012`, 새 전용 계정, 백엔드18170, 개발 앱localhost18174를 사용했다. 학교 Qwen3.6 27B가 분석·추천했고 별도 배우 에이전트가 민재의 실제UI 관찰과 짧은 잠정 기억만 사용했다. 운영자의 정답·분석을 배우 행동 입력으로 전달하지 않았다.

첫 배우의 브라우저 재접속 실패는 추천1 시작 전 기술중단이다. 같은 민재의 본인 기억을 새 배우에게 이어받았으며 새 플레이나 학습으로 세지 않았다. 추천1 관찰 메타데이터의 임시 세션ID는 실제ID로 바로잡았고 수정전 파일·해시·수정내역을 보존했다. 원본 화면·관찰시각·게임로그는 바꾸지 않았다.

직접 키입력의 원본 provenance.source에는human이 기록됐다. 이 결과는 전용계정·실행명세로 구분하는 합성 에이전트 테스트이며 사람 자료로 사용하지 않는다. `caffeinate`로 테스트 중 자동 잠자기를 억제했다.

| 회차 | 실제 세션 | 최종 분석 | 프로필 버전 |
|---|---|---|---:|
| 기초 1 | `f8bac196-ed51-40f4-9366-80c017c23c62` | `744daee9-b23e-4696-81ea-0e62e15b1a69` | 1 |
| 추천 1 | `a47a3b0b-32b8-422b-8d6a-074ce8e8d771` | `3055b33c-7120-4382-9632-1d35c82217b4` | 2 |
| 추천 2 | `a3c55e4d-baa0-4e2e-a0de-234caa786bbe` | `e1d082fb-2e4a-483d-9e82-7d25218c5ffb` | 3 |
| 추천 3 | `9ec324f3-9d95-45fa-9923-d23c682b4280` | `b0927b60-03a5-4e55-96df-7a67fe714659` | 4 |
| 기초 2(재검사) | `bfb8769d-1e12-4f6e-82bf-4394d6ffd4cd` | `fae022e2-a03f-4eed-8ffc-ae0bfbef4bed` | 5 |

- 원문: `/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012`
- 실제목표/결과/시간/AI판정: `auditor/result-summary.json`
- 원본 로그와 실제배치: `auditor/sessions/<sessionId>/`
- 생성·분석·프로필 원문: `auditor/generations.json`, `analyses.json`, `profiles.json`
- 동일 기초 조건: `auditor/baseline-comparison.json`
- 품질세부검토: `auditor/quality-notes.md`
- 개별 실제캡처·관찰·회상·입력: `actor/<회차>/`
- 보관은 아래 명령 후 원격 마운트/UUID/파일SHA-256 검증 결과를 별도 확인서로 남긴다. 인증·개인설정·실행파일은 제외하며 로컬 원본은 유지한다.

`python3 scripts/archive-test-records.py output/adaptive-five-persona-20261012 --status complete`

### 외장하드 보관 확인 — 보관 후 추가

2026-10-12 19:53 KST, `complete` 보관을 완료했다. 지정 마운트 `/mnt/wd_hdd`, 장치 `/dev/sda1`, UUID `B4E0414DE04116D0` 검사를 통과했고, 기록616개를 원격에서 SHA-256으로 다시 검증했다. 인증파일2개·실행스크립트3개는 제외했다. 로컬 원본은 유지했다.

- 원격: `/mnt/wd_hdd/oneuldo/tests/adaptive-five-persona-20261012/75ed861c3cf13cde1829d876723f33bd46dd28f2ff16b773cdec324f0fa8a7a5`
- [보관 확인서](/Users/bluem/Documents/GitHub/Oneuldo/output/.test-archives/adaptive-five-persona-20261012/75ed861c3cf13cde1829d876723f33bd46dd28f2ff16b773cdec324f0fa8a7a5.receipt.json)

원격 `records/REPORT.md`에는 보관 직전 확정한 보고서와5회 캡처 참조가 들어 있다. 이 확인 문단은 검증 성공 후 저장소 문서에 추가했으며 원격 스냅샷을 덮어쓰지 않았다.

## 회차별 실제 플레이 장면

### 기초 1

![기초 1 실제 플레이 매대](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/baseline-pre/playing.png)

[원본 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/baseline-pre/playing.png)

### 추천 1

![추천 1 실제 플레이 매대](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/recommendation-1/playing-wide.jpg)

[원본 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/recommendation-1/playing-wide.jpg)

### 추천 2

![추천 2 실제 플레이 매대](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/recommendation-2/playing-wide.jpg)

[원본 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/recommendation-2/playing-wide.jpg)

### 추천 3

![추천 3 실제 플레이 매대](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/recommendation-3/playing-wide.jpg)

[원본 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/recommendation-3/playing-wide.jpg)

### 기초 2(재검사)

![기초 2(재검사) 실제 플레이 매대](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/baseline-post/playing-full-layout.jpg)

[원본 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-persona-20261012/actor/baseline-post/playing-full-layout.jpg)
