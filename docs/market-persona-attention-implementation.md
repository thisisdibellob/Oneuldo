# 페르소나 주의·탐색 정책 구현과 검증

2026-09-28. `mild-intellectual-disability-adult` v3, stochastic 정책 v4, trace schema v2.

구매 목표, 현재 기억하는 목표, 관심 대상을 분리했다. 상품에 익숙한 성인도 처음 보는 매장에서는 통로를 탐색하고, 관심 있는 매대를 살피다가 목록을 다시 확인하거나 목표로 돌아오지 않을 수 있다. 이는 허구의 성인 지민을 위한 합성 정책이며 실제 장애 집단에서 추정한 행동 분포가 아니다.

## 구현

- `AttentionPolicy`는 현재 화면의 매대·통로·상품 행과 보유 기억만 받는다. 전체 지도·정답·가려진 재고는 전달하지 않는다. `readList`로 실제 HUD 목록을 스크롤해 읽고, `browse`로 보이는 상품 행을 바꾼다.
- `walkToAnchor`는 가까운 통로 구간까지의 의도다. 앱은 기존 조이스틱·충돌 처리를 사용한다. 도중의 다음 의도에서 방향이나 관심 대상이 바뀔 수 있다. 순간이동과 전체 목적지까지의 자동 우회는 사용하지 않는다.
- 관심 포착은 관찰된 개인 취향 단서에 의존한다. 체류 길이는 이미 본 페이지·관심 상품 확인·구매 여부에 따라 달라진다. 체류 종료와 목표 복귀는 별도 결정이다. 관심 구매를 자동으로 제거하지 않는다.
- 기존 반응 시간·망설임·재확인·도움·유사 상품 혼동·수량 착오 파라미터는 관찰 가능한 상황 및 기억 상태와 함께 사용한다. 도착하지 않은 AI 평가를 만들어 학습시키지 않는다.
- 재방문은 이전 trace의 `attentionExperience.memory`와 `previousLayoutKey`를 명시적으로 받는다. 배치가 바뀌면 공간 기억을 이월하지 않는다. 이 기억의 출처는 `planned-trace`이며 실제 앱 학습의 증거가 아니다.
- LLM 모드도 동일한 관측 경계를 사용한다. 이번 검증에서는 모의 응답으로 요청·출력 계약을 검사했으며 외부 유료 모델은 호출하지 않았다.
- 원자료 전문·근거 링크·금지 재현 목록을 보존하고 JSON 프로필, v3 프롬프트 사본, 스킬 설명을 맞췄다. careful/quick 프로필과 기존 v1 trace는 호환된다.

## 자동 검증

- 생성기·MCP·브릿지 전체 64개 테스트 통과, TypeScript 검사 통과.
- 프론트 전체 461개 테스트 통과 후 정상 퇴장·위치 오차 경계 회귀를 추가했고 관련 12개 및 21개 테스트도 통과했다. 최종 TypeScript 검사 통과.
- [최종 10개 계획 표본](../market-simulator/output/attention-validation-20260928/final-samples-v4/report.json): 고정 매장·사과 2개/생수 1개 목표, 서로 다른 seed, 생성·스키마·게임 가드 검증 10/10 통과. 기술 실패 0건. 대기시간·reason·모터 난수를 제외한 의미 시퀀스 10종. 같은 seed는 JSON 전체가 동일하게 재현됐다.
- 이 10개 중 5개에서 목표 밖 간편식 매대 방문 및 목록 재확인이 발생했다. 관심 체류는 2회 또는 4회였다. 비목표 구매는 이 표본에서 0건이며, 현재 보이는 카레를 선택하는 분기는 별도의 정책 테스트에서 확인했다. 120개 seed의 통제된 동일 장면 테스트에서는 체류 2~6회 모두 발생했다.
- 내부 adapter 이동 3,114회를 검사했고 최대 이동은 약 23.57px로 32px 제한 이내였다. 위치 변화는 허용된 move 합계와 일치했다. 이것만으로 실제 화면 재생을 검증했다고 간주하지 않는다.
- 같은 seed에 이전 계획의 기억을 명시적으로 넣은 재방문 표본도 가드 검증을 통과했다(첫 방문 61단계, 재방문 48단계). 단일 계획 비교이며 실제 앱 학습 효과로 해석하지 않는다.

## 재실행

```sh
npm --prefix market-simulator run verify:attention -- --count 10 --output /absolute/new-directory
```

MCP의 `generate_trace`는 trace와 함께 `.snapshot.json`을 저장한다. 실제 앱에서는 첫 브리핑의 새 snapshot에 맞춰 생성·검증한 뒤 전체 trace를 한 번 전달한다. 기존 tracker·queue·BehaviorLogRequest 전송 경로를 사용하고 생성기가 서버 로그를 만들어 올리지 않는다.

전체 trace는 미리 만든 계획이다. 실제 재생 중 새로운 상황을 모델에 다시 보내 재계획하는 기능은 이번 범위에 포함하지 않았다. 의미가 다른 앱 상태나 화면 조건을 만나면 실행을 중단한다. 생성기의 기술적 상한 초과도 인물의 포기 행동으로 바꾸지 않는다.

## 최종 실제 앱 재생

검증용 Expo를 최종 소스로 재시작하고 실제 698×863 화면·줌 1.3 snapshot에 새 trace를 생성했다. 기존 Expo의 CI 캐시가 v1 스키마를 제공하여 실행 전에 거부했던 시도는 성공 표본에 포함하지 않았다.

화면 통합 검사에는 `attention-live-0` seed의 71단계 계획을 선택했다. 표본 분포 평가는 위의 고정 seed 10개 검증으로 별도 기록했다. 앱은 전체 trace를 한 번 받은 뒤 약 330.2초 동안 실행했다.

실제 완료 흐름은 **목록 읽기 → 여러 통로 탐색 → 목표 밖 간편식 매대 열기 → 3회 구경 → 목록 재확인 → 바나나·우유 드래그 → 장바구니 확인 → 직원에게 계산대 호출 요청 → 구매 검토 접수 → 마을로 퇴장**이었다.

- 재생 `499726cb-1301-48df-a5c4-1f4af29d5452`: `completed`, 71/71, `acknowledged:true`.
- 실제 이동 11,133프레임, 드래그 2회, 이동 속도·입력 변화 위반 0건. 순간이동이나 전역 경로 재탐색 없이 실행했다.
- 격리 로컬 DB 세션 `fbd2921d-6ddf-49dd-9cdb-54c43d363fbc`: 3,160개 이벤트 / 154개 배치. 순번 1~3,160, 순번·clientEventId 중복 없음, 발생 시간 역전 없음, 종료 이벤트 1개.
- 분석 작업 `968f7468-33a2-49e0-9876-b504bb8bd51a`는 `QUEUED`. 접수까지 확인한 것이며 AI 분석 완료나 모델 학습 완료를 뜻하지 않는다. 배치 POST 응답 원문을 캡처한 검사는 아니며 실제 DB 영속화로 확인했다.

[실행한 trace](../market-simulator/output/attention-validation-20260928/verified-live-0.json), [초기 snapshot](../market-simulator/output/attention-validation-20260928/verified-live-trace.json.snapshot.json), [앱 실행 측정](../market-simulator/output/attention-validation-20260928/live-replay-result.json), [DB 검증](../market-simulator/output/attention-validation-20260928/db-verification.json), [퇴장 화면](../market-simulator/output/attention-validation-20260928/live-final-screen.png).
