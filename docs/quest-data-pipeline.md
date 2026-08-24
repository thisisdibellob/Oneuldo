# 퀘스트 데이터 파이프라인 작업 현황

## 1. 문서 목적

이 문서는 PostgreSQL에 저장된 퀘스트 데이터를 백엔드 서비스 계층까지 전달하기 위해 완료한 작업과 앞으로 진행할 작업을 정리한다.

현재 구현 범위는 `PostgreSQL → JPA Entity → Repository → Service → 응답 DTO`까지다. Controller와 프론트엔드 API 연결은 후속 작업으로 진행한다.

## 2. 현재 데이터 흐름

```text
PostgreSQL
  ↓
Quest Entity
  ↓
QuestRepository
  ↓
QuestService
  ↓
QuestSummaryResponse
```

각 구성요소의 역할은 다음과 같다.

| 구성요소 | 역할 |
| --- | --- |
| PostgreSQL | 퀘스트 카테고리와 퀘스트 데이터 저장 |
| Entity | DB 데이터를 Java 객체로 표현 |
| Repository | JPA를 사용해 DB 데이터를 저장하고 조회 |
| Service | 활성 퀘스트 조회와 DTO 변환 처리 |
| DTO | 프론트엔드에 필요한 데이터만 전달 |

## 3. 완료한 작업

- [x] 프론트엔드 퀘스트 화면의 기존 데이터 구조 확인
- [x] 퀘스트 상위 카테고리, 세부 카테고리, 퀘스트 테이블 설계
- [x] 퀘스트 난이도를 `VERY_EASY`부터 `VERY_HARD`까지 정의
- [x] `V3__create_quest_tables.sql` 작성
- [x] `QuestDifficulty` Enum 작성
- [x] `QuestCategory` Entity 작성
- [x] `QuestSubcategory` Entity 작성
- [x] `Quest` Entity 작성
- [x] 퀘스트 Repository 3개 작성
- [x] `QuestSummaryResponse` 응답 DTO 작성
- [x] `QuestService.findActiveQuests()` 구현
- [x] `V4__insert_initial_quest_data.sql` 작성
- [x] 로컬 PostgreSQL에 Flyway V3·V4 적용
- [x] PostgreSQL에서 초기 퀘스트 4개 조회 확인
- [x] `QuestServiceTest` 작성
- [x] 활성 퀘스트만 조회되는지 H2 테스트로 확인
- [x] `./gradlew clean test` 성공

## 4. 추가된 주요 파일

```text
backend/src/main/java/oneuldo/quest/
├── domain/
│   ├── Quest.java
│   ├── QuestCategory.java
│   ├── QuestDifficulty.java
│   └── QuestSubcategory.java
├── dto/
│   └── QuestSummaryResponse.java
├── repository/
│   ├── QuestCategoryRepository.java
│   ├── QuestRepository.java
│   └── QuestSubcategoryRepository.java
└── service/
    └── QuestService.java

backend/src/main/resources/db/migration/
├── V3__create_quest_tables.sql
└── V4__insert_initial_quest_data.sql

backend/src/test/java/oneuldo/quest/service/
└── QuestServiceTest.java
```

## 5. 데이터베이스 구조

```text
quest_categories
  └── quest_subcategories
        └── quests
```

- `quest_categories`: 생활과 같은 상위 카테고리
- `quest_subcategories`: 대중교통, 생활 훈련, 경제생활, 안전과 같은 화면 필터
- `quests`: 사용자가 실제로 수행할 퀘스트

초기 데이터로 다음 퀘스트를 등록했다.

| 코드 | 제목 | 세부 카테고리 | 난이도 | 경험치 |
| --- | --- | --- | --- | ---: |
| `TAKE_BUS_ALONE` | 혼자 버스 타기 | 대중교통 | `EASY` | 20 |
| `ORDER_AT_CAFE` | 카페에서 주문하기 | 생활 훈련 | `EASY` | 20 |
| `SHOP_AT_MARKET` | 마트에서 장보기 | 경제생활 | `NORMAL` | 30 |
| `ASK_FOR_HELP` | 도움을 요청하는 법 | 안전 | `EASY` | 20 |

## 6. 실행 및 확인 방법

로컬 PostgreSQL과 백엔드를 실행할 때는 동일한 DB 비밀번호를 사용한다.

```bash
cd infra
export DB_PASSWORD='로컬 DB 비밀번호'
docker-compose up -d

cd ../backend
export DB_PASSWORD='로컬 DB 비밀번호'
./gradlew bootRun --args='--spring.profiles.active=local'
```

Flyway 로그에서 스키마 버전이 `v4`인지 확인한다.

```text
Successfully validated 4 migrations
Successfully applied 2 migrations to schema "public", now at version v4
```

초기 퀘스트 데이터는 다음 명령으로 확인할 수 있다.

```bash
docker exec -it oneuldo-postgres \
  psql -U oneuldo -d oneuldo \
  -c "SELECT code, title, difficulty, reward_points, active FROM quests ORDER BY title;"
```

전체 테스트는 다음 명령으로 실행한다.

```bash
cd backend
./gradlew clean test
```

테스트 환경에서는 실제 로컬 데이터를 변경하지 않도록 H2 인메모리 DB를 사용한다.

## 7. 앞으로 해야 할 작업

> 2026-08-15 업데이트: 퀘스트 상세·단계·선택지와 수행 세션·이벤트 API 및 프론트 연동은 Phase 1에서 구현을 완료했다. 아래 항목은 초기 문서 작성 당시의 작업 목록이며 최신 AI 진행 상태는 [AI 시스템 통합 문서](./ai/README.md)를 기준으로 한다.

### 백엔드 API

- [ ] `QuestController` 작성
- [ ] 활성 퀘스트 목록 조회 API 경로 결정
- [ ] `QuestService.findActiveQuests()`를 Controller에 연결
- [ ] HTTP 응답 상태와 JSON 형태 확인
- [ ] Controller API 테스트 작성
- [ ] 인증이 필요한 API인지 정책 결정

### 프론트엔드 연결

- [ ] 백엔드 API 기본 주소를 환경별 설정으로 관리
- [ ] 퀘스트 목록 API 호출 함수 작성
- [ ] `QuestScreen`의 하드코딩된 퀘스트 목록 제거
- [ ] API 응답을 퀘스트 카드에 표시
- [ ] `categoryCode`를 아이콘과 색상에 연결
- [ ] 로딩, 빈 목록, 요청 실패 화면 처리

### 퀘스트 상세 기능

- [ ] 퀘스트 단계와 선택지 테이블 설계
- [ ] 퀘스트 상세 조회 DTO와 Service 작성
- [ ] 정답을 프론트엔드에 미리 노출하지 않는 검증 API 설계
- [ ] 사용자 퀘스트 수행 기록과 경험치 저장 방식 결정

### 마무리

- [ ] 현재 변경사항 Git 커밋
- [ ] Pull Request 작성
- [ ] 팀원 코드 리뷰 반영
- [ ] 문서와 실제 구현이 달라질 때 이 문서 갱신

## 8. 참고 사항

- 실사용 DB는 PostgreSQL이며 H2는 자동 테스트에서만 사용한다.
- DB 구조 변경은 기존 마이그레이션을 수정하지 않고 새로운 Flyway 버전 파일을 추가한다.
- 프론트엔드 아이콘 경로와 색상은 DB에 저장하지 않고 `categoryCode`를 기준으로 프론트엔드에서 관리한다.
- Entity를 Controller에서 직접 반환하지 않고 응답 DTO를 사용한다.
