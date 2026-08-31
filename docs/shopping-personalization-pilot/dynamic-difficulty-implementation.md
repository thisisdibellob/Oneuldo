# 장보기 동적 난이도 개인화 구현 명세

## 1. 구현 목적

장보기 플레이에서 수집한 행동 근거를 사용자별 프로파일로 집계하고, 다음 장보기 미션의 난이도와 지원 수준을 자동으로 조정한다. 이 문서의 규칙형 추천은 현재 AI 정상 생성 경로의 fallback 정책이다. 실제 AI 생성 경로는 [AI 사용자 상태 기반 장보기 퀘스트 생성 구현](./ai-personalized-quest-implementation.md)을 기준으로 한다.

이 기능은 IQ, 장애 정도 또는 임상적 능력을 판정하지 않는다. 게임에서 관찰된 독립 수행 근거만 사용하며, 근거가 부족하면 난이도를 변경하지 않는다.

## 2. 적용 범위

- 적용 게임: `MARKET_SIMULATION`
- 정책 버전: `market-personalization-v1`
- 기본 난이도: `2`
- 조정 범위: 난이도 `1~3`, 품목 수 `2~4`, 수량 복잡도, 예산 여유, 안내 문장 수
- 재검증 실험과 임상적 타당성 평가는 이번 구현 범위에서 제외한다.

## 3. 처리 흐름

```text
장보기 플레이
  → 행동 이벤트 배치 저장
  → 이벤트 정규화
  → 완료 세션 기반 행동 프로파일 생성
  → 장보기 추천 스냅샷 생성
  → GET /api/market-personalization/recommendation
  → 프론트에서 개인화 미션 생성
  → 다음 장보기 플레이 및 행동 로그 수집
```

프로파일 생성이 끝나면 추천도 자동 갱신된다. 동일 프로파일에 대한 추천은 새로 만들지 않고 기존 스냅샷을 반환한다.

## 4. 사용하는 능력 신호

| 기술 코드 | 장보기에서 조정하는 항목 |
|---|---|
| `LANGUAGE_COMPREHENSION` | 안내 문장 수준, 품목 수 |
| `NUMERACY` | 요구 수량 복잡도 |
| `MONEY_MANAGEMENT` | 예산 여유 |
| `EXECUTIVE_FUNCTION` | 품목 수 |

한 기술 신호가 난이도 조정에 사용되려면 다음 조건을 모두 만족해야 한다.

- 독립 수행 성공률이 존재한다.
- 독립 평가 근거가 5건 이상이다.
- 서로 다른 세션이 2개 이상이다.
- 신뢰도가 `MEDIUM` 또는 `HIGH`다.

## 5. 난이도 결정 규칙

| 조건 | 결과 |
|---|---|
| 프로파일 없음 | 난이도 2, `NO_PROFILE` |
| 사용할 수 있는 근거 없음 | 난이도 2, `INSUFFICIENT_EVIDENCE` |
| 사용 가능한 기술 중 하나라도 성공률 50% 미만 | 난이도 1 |
| 네 기술 모두 사용 가능하고 모두 80% 이상 | 난이도 3 |
| 그 외 | 난이도 2 유지 |

일부 기술의 근거만 있을 때도 약점 지원은 적용할 수 있지만, 난이도 3 승급은 네 기술의 근거가 모두 안정적일 때만 가능하다.

## 6. 미션 조정 규칙

### 6.1 품목 수

- 언어 이해 또는 실행 기능이 50% 미만: 2개
- 언어 이해와 실행 기능이 모두 80% 이상: 4개
- 그 외: 3개

### 6.2 수량 복잡도

- 수리 능력 50% 미만: 모든 품목 1개
- 수리 능력 80% 이상: 품목별 2개, 3개, 2개, 1개
- 그 외: 품목별 1개, 2개, 1개, 1개

### 6.3 예산 압박

목표 상품 총액에 다음 여유 금액을 더한 뒤 500원 단위로 올림한다.

- 돈 관리 50% 미만: 3,500원 여유
- 돈 관리 80% 이상: 500원 여유
- 그 외: 2,500원 여유

### 6.4 안내 문장

- 언어 이해 50% 미만: 구체적인 2문장 안내
- 언어 이해 80% 이상: 핵심 1문장 안내
- 그 외: 기존 기본 안내 2문장

## 7. API

### 요청

```http
GET /api/market-personalization/recommendation
Authorization: Bearer <access-token>
```

### 응답 예시

```json
{
  "recommendationId": "uuid",
  "profileSnapshotId": "uuid",
  "gameId": "MARKET_SIMULATION",
  "recommendedDifficulty": 2,
  "personalizationMode": "INSUFFICIENT_EVIDENCE",
  "adjustments": {
    "itemCount": 3,
    "quantityComplexity": "MEDIUM",
    "budgetPressure": "MEDIUM",
    "textSupport": "STANDARD"
  },
  "reasonCodes": [
    "MINIMUM_EVIDENCE_NOT_MET",
    "LANGUAGE_COMPREHENSION_EVIDENCE_INSUFFICIENT"
  ],
  "policyVersion": "market-personalization-v1",
  "generatedAt": "2026-08-29T07:00:00Z"
}
```

API 호출에 실패하거나 로그인 토큰이 없으면 프론트는 기존 난이도 2 미션으로 되돌아간다.

## 8. 저장 구조

Flyway `V27`에서 `market_difficulty_recommendations` 테이블을 추가했다.

주요 필드는 다음과 같다.

- 사용자 ID와 근거 프로파일 스냅샷 ID
- 정책 버전과 생성 시각
- 추천 난이도와 개인화 모드
- 품목 수, 수량 복잡도, 예산 압박, 안내 수준
- 판단 사유 코드 목록(JSONB)

동일 사용자와 동일 프로파일 조합에는 추천 스냅샷을 하나만 저장한다. 따라서 어떤 프로파일과 정책으로 미션이 정해졌는지 사후 추적할 수 있다.

## 9. 행동 로그 연결

개인화된 미션 ID와 난이도는 다음 플레이의 행동 로그에 기록된다.

- `instructionContentId`: `market-personalized-d1`, `market-personalized-d2` 또는 `market-personalized-d3`
- `difficulty`: 추천 난이도
- `requiredQuantity`, `budgetAmount`: 실제 개인화 미션 값

재시도 세션도 같은 미션을 사용하되, 근거 용도는 `TRAINING_TASK`로 기록한다.

## 10. 개발 로그

프론트 개발 모드에서 추천 적용 결과를 확인할 수 있다.

```text
[market-personalization] recommendation applied
{ difficulty: 2, mode: "INSUFFICIENT_EVIDENCE", reasons: [...] }
```

API 오류 시 다음 로그와 함께 기본 미션을 사용한다.

```text
[market-personalization] baseline fallback
```

## 11. 검증 명령

```bash
cd frontend
pnpm typecheck
pnpm test

cd ../backend
JAVA_HOME=/opt/homebrew/opt/openjdk@25/libexec/openjdk.jdk/Contents/Home \
PATH=/opt/homebrew/opt/openjdk@25/bin:$PATH \
./gradlew test
```

정책 단위 테스트는 근거 없음, 약점 감지, 네 기술 안정, 근거 부족의 네 경계를 검증한다. 통합 테스트는 원본 저장부터 정규화, 프로파일, 추천 스냅샷 생성까지 순서대로 확인한다.

## 12. 현재 한계와 다음 검증 항목

- 현재 임계값 50%와 80%는 제품 정책값이며 전문기관 검증값이 아니다.
- 품목 후보는 우유, 사과, 카레, 주스의 고정 목록이다.
- 난이도는 다음 화면 진입 시 적용되며 진행 중인 미션을 중간에 바꾸지 않는다.
- 실제 사용자 반복 플레이에서 과도한 난이도 진동이 발생하는지 아직 검증하지 않았다.
- 다음 단계에서는 최소 2세션 이상 데이터를 만든 뒤 추천 변화, 사유 코드, 로그 값과 실제 UI를 대조해야 한다.
