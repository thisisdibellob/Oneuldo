# 오늘도 데이터베이스 명세

## 1. 문서 목적

이 문서는 오늘도 서비스가 저장할 데이터와 테이블 간 관계를 정의한다. 실제 PostgreSQL 테이블과 Flyway 마이그레이션을 작성하기 전에 팀이 데이터 구조를 검토하기 위한 논리 명세다.

초기 범위는 다음과 같다.

- 사용자 기본 정보
- 퀘스트와 단계·선택지
- 사용자의 퀘스트 수행 기록
- 수행 지표와 점수
- 카테고리별 추천 난이도
- 난이도 판정 이력

인증 방식, 보호자 연결과 기관 관리 데이터는 기능 정책을 확정한 뒤 별도 테이블로 추가한다.

## 2. 공통 규칙

### 2.1 이름 규칙

- 테이블과 컬럼 이름은 영문 `snake_case`를 사용한다.
- 기본 키는 컬럼 이름을 `id`로 통일한다.
- 외래 키는 `{대상}_id` 형식을 사용한다.
- 생성·수정 시각은 `created_at`, `updated_at`을 사용한다.
- 시각은 PostgreSQL `TIMESTAMPTZ`로 저장하고 서버와 DB의 기준 시간대는 UTC로 통일한다.

### 2.2 기본 키와 데이터 보존

- 서비스 도메인 데이터의 기본 키는 UUID를 우선 사용한다.
- 사용자의 수행 원본 이벤트는 분석 결과가 바뀌어도 수정하지 않는다.
- 계산된 지표와 난이도 판정 결과는 원본 데이터와 분리해 저장한다.
- 사용자 데이터 삭제 정책은 개인정보 정책 확정 후 소프트 삭제 또는 완전 삭제 방식으로 결정한다.

### 2.3 난이도 값

퀘스트 난이도는 다음 다섯 단계로 제한한다.

| 코드 | 화면 표시 | 순서 |
| --- | --- | ---: |
| `VERY_EASY` | 매우 쉬움 | 1 |
| `EASY` | 쉬움 | 2 |
| `NORMAL` | 보통 | 3 |
| `HARD` | 어려움 | 4 |
| `VERY_HARD` | 매우 어려움 | 5 |

DB에는 변경과 검증이 쉬운 영문 코드를 저장하고, 한글 명칭은 프론트엔드에서 표시한다.

## 3. 테이블 관계 요약

```text
users
  └─ quest_sessions
       ├─ quest_events
       ├─ quest_session_metrics
       └─ difficulty_adjustment_history

quest_categories
  └─ quest_subcategories
       ├─ quests
       ├─ user_category_levels
       └─ difficulty_adjustment_history

quests
  └─ quest_steps
       └─ quest_choices
```

## 4. 사용자 및 퀘스트 데이터

### 4.1 `users`

서비스 사용자 기본 정보를 저장한다. 로그인과 보호자 관계가 확정되기 전까지 최소 정보만 둔다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 사용자 식별자 |
| `display_name` | VARCHAR(50) | Y | 화면에 표시할 이름 |
| `status` | VARCHAR(20) | Y | `ACTIVE`, `INACTIVE`, `DELETED` |
| `created_at` | TIMESTAMPTZ | Y | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 수정 시각 |

민감한 진단 정보는 초기 테이블에 저장하지 않는다.

### 4.2 `quest_categories`

생활·직업과 같은 상위 카테고리를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 상위 카테고리 식별자 |
| `code` | VARCHAR(50) | Y | 중복되지 않는 코드. 예: `LIFE`, `JOB` |
| `name` | VARCHAR(50) | Y | 화면 표시명. 예: 생활, 직업 |
| `sort_order` | INTEGER | Y | 화면 표시 순서 |
| `active` | BOOLEAN | Y | 사용 여부 |
| `created_at` | TIMESTAMPTZ | Y | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 수정 시각 |

제약 조건:

- `code`는 고유해야 한다.
- `sort_order`는 0 이상이어야 한다.

### 4.3 `quest_subcategories`

세면·장보기·외식·고객 응대·출퇴근과 같은 세부 카테고리를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 세부 카테고리 식별자 |
| `category_id` | UUID | Y | 상위 카테고리 FK |
| `code` | VARCHAR(50) | Y | 세부 카테고리 코드 |
| `name` | VARCHAR(50) | Y | 화면 표시명 |
| `min_difficulty` | VARCHAR(20) | Y | 제공하는 최소 난이도 코드 |
| `max_difficulty` | VARCHAR(20) | Y | 제공하는 최대 난이도 코드 |
| `sort_order` | INTEGER | Y | 상위 카테고리 내부 표시 순서 |
| `active` | BOOLEAN | Y | 사용 여부 |
| `created_at` | TIMESTAMPTZ | Y | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 수정 시각 |

제약 조건:

- 동일한 상위 카테고리 안에서 `code`는 고유해야 한다.
- 최소 난이도 순서는 최대 난이도 순서보다 높을 수 없다.

초기 카테고리 예시는 다음과 같다.

| 상위 카테고리 | 세부 카테고리 | 난이도 범위 |
| --- | --- | --- |
| 생활 | 세면 | 매우 쉬움 ~ 쉬움 |
| 생활 | 장보기 | 쉬움 ~ 보통 |
| 생활 | 외식 | 쉬움 ~ 보통 |
| 직업 | 고객 응대 | 보통 ~ 어려움 |
| 직업 | 출퇴근 | 어려움 ~ 매우 어려움 |

### 4.4 `quests`

사용자가 수행할 퀘스트의 기본 정보를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 퀘스트 식별자 |
| `subcategory_id` | UUID | Y | 세부 카테고리 FK |
| `code` | VARCHAR(100) | Y | 변경되지 않는 퀘스트 코드 |
| `title` | VARCHAR(100) | Y | 퀘스트 제목 |
| `summary` | VARCHAR(500) | Y | 목록에 표시할 간단한 설명 |
| `goal` | VARCHAR(500) | Y | 학습 목표 |
| `difficulty` | VARCHAR(20) | Y | 난이도 코드 |
| `reward_points` | INTEGER | Y | 완료 보상 점수 |
| `active` | BOOLEAN | Y | 사용자에게 노출할지 여부 |
| `created_at` | TIMESTAMPTZ | Y | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 수정 시각 |

제약 조건:

- `code`는 고유해야 한다.
- `reward_points`는 0 이상이어야 한다.
- 난이도는 세부 카테고리의 제공 범위 안에 있어야 한다.

### 4.5 `quest_steps`

퀘스트를 구성하는 순차 단계를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 단계 식별자 |
| `quest_id` | UUID | Y | 퀘스트 FK |
| `step_order` | INTEGER | Y | 퀘스트 내부 진행 순서 |
| `instruction` | VARCHAR(300) | Y | 사용자에게 제시할 행동 안내 |
| `situation` | VARCHAR(1000) | Y | 현재 상황 설명 |
| `hint` | VARCHAR(500) | N | 사용자가 요청할 수 있는 힌트 |
| `created_at` | TIMESTAMPTZ | Y | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 수정 시각 |

동일 퀘스트 안에서 `step_order`는 고유하며 1부터 시작한다.

### 4.6 `quest_choices`

각 퀘스트 단계에서 선택할 수 있는 답을 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 선택지 식별자 |
| `step_id` | UUID | Y | 단계 FK |
| `choice_order` | INTEGER | Y | 단계 내부 표시 순서 |
| `label` | VARCHAR(500) | Y | 사용자에게 표시할 선택지 문장 |
| `correct` | BOOLEAN | Y | 정답 여부 |
| `feedback` | VARCHAR(500) | Y | 선택 후 표시할 설명 |
| `created_at` | TIMESTAMPTZ | Y | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 수정 시각 |

동일 단계 안에서 `choice_order`는 고유해야 하며 정답 선택지는 최소 1개 존재해야 한다.

## 5. 퀘스트 수행 원본 데이터

### 5.1 `quest_sessions`

사용자가 퀘스트를 시작한 시점부터 종료할 때까지의 수행 단위를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 수행 세션 식별자 |
| `user_id` | UUID | Y | 사용자 FK |
| `quest_id` | UUID | Y | 수행한 퀘스트 FK |
| `quest_difficulty` | VARCHAR(20) | Y | 수행 당시 난이도 스냅샷 |
| `status` | VARCHAR(20) | Y | `IN_PROGRESS`, `COMPLETED`, `ABANDONED` |
| `total_steps` | INTEGER | Y | 시작 당시 전체 단계 수 |
| `completed_steps` | INTEGER | Y | 정답으로 완료한 단계 수 |
| `reward_points` | INTEGER | Y | 실제 지급한 보상 점수 |
| `started_at` | TIMESTAMPTZ | Y | 퀘스트 시작 시각 |
| `completed_at` | TIMESTAMPTZ | N | 정상 완료 시각 |
| `abandoned_at` | TIMESTAMPTZ | N | 중단 시각 |
| `abandon_reason` | VARCHAR(50) | N | 사용자 중단, 앱 종료, 네트워크 오류 등의 코드 |

퀘스트 내용이나 난이도가 나중에 변경되더라도 당시 수행 정보를 보존하기 위해 난이도와 단계 수를 스냅샷으로 저장한다.

### 5.2 `quest_events`

사용자의 단계별 선택을 수정하지 않는 원본 이벤트로 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | BIGINT | Y | 순차 이벤트 식별자 |
| `session_id` | UUID | Y | 수행 세션 FK |
| `step_id` | UUID | Y | 수행한 단계 FK |
| `choice_id` | UUID | Y | 선택한 선택지 FK |
| `attempt_number` | INTEGER | Y | 해당 단계에서 몇 번째 선택인지 표시 |
| `correct` | BOOLEAN | Y | 선택 당시 정답 여부 스냅샷 |
| `hint_used` | BOOLEAN | Y | 선택 전에 힌트를 확인했는지 여부 |
| `response_time_ms` | BIGINT | Y | 단계 노출부터 선택까지 걸린 시간 |
| `created_at` | TIMESTAMPTZ | Y | 이벤트 발생 시각 |

제약 조건:

- `attempt_number`는 1 이상이어야 한다.
- `response_time_ms`는 0 이상이어야 한다.
- 동일 세션·단계의 시도 순번은 중복될 수 없다.

## 6. 가공 데이터와 난이도 조절

### 6.1 `quest_session_metrics`

한 번의 완료 또는 중단 세션에서 계산한 수행 지표를 저장한다. 원본 이벤트가 기준이며 필요하면 다시 계산할 수 있다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `session_id` | UUID | Y | 수행 세션 PK·FK |
| `first_attempt_accuracy` | NUMERIC(5,4) | Y | 최초 선택 정답률, 0~1 |
| `final_accuracy` | NUMERIC(5,4) | Y | 최종 완료 정답률, 0~1 |
| `hint_usage_rate` | NUMERIC(5,4) | Y | 힌트를 사용한 단계 비율, 0~1 |
| `retry_rate` | NUMERIC(5,4) | Y | 재시도가 발생한 단계 비율, 0~1 |
| `completion_rate` | NUMERIC(5,4) | Y | 전체 단계 중 완료한 비율, 0~1 |
| `median_response_time_ms` | BIGINT | N | 유효 응답 시간의 중앙값 |
| `performance_score` | INTEGER | Y | 규칙에 따라 계산한 0~100점 |
| `calculation_version` | VARCHAR(20) | Y | 사용한 계산 규칙 버전. 예: `v1` |
| `calculated_at` | TIMESTAMPTZ | Y | 계산 시각 |

점수 계산 규칙이 변경되면 `calculation_version`으로 결과를 구분한다.

### 6.2 `user_category_levels`

사용자별 세부 카테고리의 현재 난이도와 최근 추천 결과를 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | Y | 레벨 정보 식별자 |
| `user_id` | UUID | Y | 사용자 FK |
| `subcategory_id` | UUID | Y | 세부 카테고리 FK |
| `current_difficulty` | VARCHAR(20) | Y | 현재 적용 난이도 |
| `recommended_difficulty` | VARCHAR(20) | Y | 최근 계산된 추천 난이도 |
| `decision` | VARCHAR(30) | Y | `DATA_INSUFFICIENT`, `PROMOTE`, `MAINTAIN`, `LOWER` |
| `reason` | VARCHAR(500) | Y | 사용자에게 설명 가능한 판정 근거 |
| `updated_at` | TIMESTAMPTZ | Y | 마지막 판정 시각 |

동일 사용자와 세부 카테고리 조합은 하나만 존재한다.

### 6.3 `difficulty_adjustment_history`

난이도 판정이 언제 어떤 근거로 이루어졌는지 변경 이력을 저장한다.

| 컬럼 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | BIGINT | Y | 순차 이력 식별자 |
| `session_id` | UUID | Y | 판정을 발생시킨 수행 세션 FK |
| `user_id` | UUID | Y | 사용자 FK |
| `subcategory_id` | UUID | Y | 세부 카테고리 FK |
| `previous_difficulty` | VARCHAR(20) | Y | 판정 전 난이도 |
| `recommended_difficulty` | VARCHAR(20) | Y | 판정 결과 난이도 |
| `decision` | VARCHAR(30) | Y | 승급·유지·하향·데이터 부족 코드 |
| `reason` | VARCHAR(500) | Y | 판정 근거 |
| `performance_score` | INTEGER | Y | 판정 당시 세션 점수 |
| `calculation_version` | VARCHAR(20) | Y | 사용한 계산 규칙 버전 |
| `created_at` | TIMESTAMPTZ | Y | 판정 시각 |

이력 데이터는 최신 상태 테이블인 `user_category_levels`와 별도로 보존한다.

## 7. 주요 인덱스

| 테이블 | 인덱스 컬럼 | 목적 |
| --- | --- | --- |
| `quest_sessions` | `(user_id, started_at DESC)` | 사용자 수행 이력 조회 |
| `quest_sessions` | `(user_id, quest_id, completed_at DESC)` | 퀘스트별 최근 수행 조회 |
| `quest_events` | `(session_id, created_at)` | 세션 이벤트 순서 조회 |
| `quests` | `(subcategory_id, difficulty, active)` | 카테고리·난이도별 퀘스트 조회 |
| `user_category_levels` | `(user_id, subcategory_id)` UNIQUE | 사용자별 현재 추천 조회 |
| `difficulty_adjustment_history` | `(user_id, subcategory_id, created_at DESC)` | 난이도 변경 이력 조회 |

## 8. 데이터 처리 흐름

```text
1. 사용자가 퀘스트를 시작한다.
2. quest_sessions에 진행 중 세션을 생성한다.
3. 선택할 때마다 quest_events에 원본 이벤트를 추가한다.
4. 완료 또는 중단 시 quest_session_metrics를 계산해 저장한다.
5. 동일 세부 카테고리의 최근 기록을 집계한다.
6. user_category_levels의 추천 난이도와 판정 근거를 갱신한다.
7. difficulty_adjustment_history에 이번 판정을 추가한다.
8. 다음 퀘스트 목록에서 추천 난이도와 가까운 퀘스트를 표시한다.
```

## 9. 삭제 및 변경 원칙

- 카테고리, 퀘스트, 단계와 선택지는 수행 이력이 있으면 물리 삭제하지 않고 `active` 상태로 노출을 중단한다.
- 수행 세션을 삭제해야 할 때 이벤트, 지표와 난이도 판정 이력의 처리 범위를 함께 확인한다.
- 통계와 이력의 신뢰성을 위해 원본 이벤트를 임의로 수정하지 않는다.
- 사용자의 개인정보 삭제 요청에 대응할 수 있도록 사용자별 데이터 조회와 삭제 범위를 별도로 정의한다.

## 10. 구현 전 확인할 사항

- 사용자 인증 방식과 사용자 역할 구분
- 보호자·아동 연결 구조
- 한 단계에 복수 정답을 허용할지 여부
- 퀘스트 및 단계 수정 이력 관리 방식
- 진행 중 세션의 만료 시간과 자동 중단 기준
- 네트워크 재전송 시 이벤트 중복 방지 방식
- 사용자 데이터 보존 기간과 삭제 정책
- 난이도 변경을 자동 적용할지 사용자·보호자 확인 후 적용할지 여부
