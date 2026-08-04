# 오늘도 협업 가이드

이 문서는 오늘도 프로젝트의 개발 환경과 Git/GitHub 협업 규칙을 정의한다. 모든 팀원은 작업을 시작하기 전에 이 문서를 확인한다.

## 1. 개발 환경

| 항목 | 버전 및 기준 | 비고 |
| --- | --- | --- |
| Java | 25 LTS | Eclipse Temurin 권장 |
| Spring Boot | 4.1.0 | `backend/build.gradle.kts` 기준 |
| Gradle | 9.5.1 | 별도 설치 없이 Gradle Wrapper 사용 |
| 개발 DB | H2 | 운영 DB는 추후 결정 |
| IDE | IntelliJ IDEA 권장 | Project SDK와 Gradle JVM을 Java 25로 설정 |

- Java 패치 버전은 `25.0.x` 범위에서 최신 안정 버전을 사용한다.
- 라이브러리 버전은 문서에 중복해서 고정하지 않고 `build.gradle.kts`를 기준으로 한다.
- Gradle은 개인 PC에 설치된 명령어 대신 프로젝트에 포함된 `gradlew`를 사용한다.

### 백엔드 실행

```bash
cd backend
./gradlew bootRun
```

기본 서버 주소는 `http://localhost:8080`이다.

### 테스트 및 빌드

```bash
cd backend
./gradlew test
./gradlew build
```

Windows에서는 `gradlew.bat`을 사용한다.

## 2. Git 전략

이 프로젝트는 `main` 중심의 GitHub Flow를 사용한다.

- `main`: 항상 실행 및 배포 가능한 상태를 유지한다.
- 모든 작업은 GitHub Issue를 먼저 생성한 후 시작한다.
- 하나의 Issue마다 하나의 작업 브랜치와 하나의 Pull Request를 사용한다.
- `main`에 직접 커밋하거나 Push하지 않는다.
- PR 리뷰와 테스트가 끝난 뒤 `main`에 병합한다.
- 병합이 끝난 작업 브랜치는 삭제한다.

### 작업 흐름

1. GitHub Issue를 생성하고 담당자와 Label을 지정한다.
2. 최신 `main`을 기준으로 작업 브랜치를 생성한다.
3. 작업 단위별로 커밋한다.
4. 원격 저장소에 Push하고 Pull Request를 생성한다.
5. PR 본문에 변경 내용, 테스트 결과, 관련 Issue를 작성한다.
6. 최소 1명의 리뷰 승인을 받고 테스트 통과 후 병합한다.
7. 병합된 브랜치를 삭제하고 Issue가 닫혔는지 확인한다.

## 3. 브랜치 규칙

브랜치 이름은 다음 형식을 사용한다.

```text
종류/이슈번호-간단한-작업명
```

| 종류 | 용도 | 예시 |
| --- | --- | --- |
| `feature` | 기능 개발 | `feature/12-member-signup` |
| `fix` | 버그 수정 | `fix/18-login-error` |
| `docs` | 문서 작업 | `docs/7-collaboration-guide` |
| `refactor` | 기능 변경 없는 구조 개선 | `refactor/21-member-service` |
| `test` | 테스트 추가 및 수정 | `test/25-member-api` |
| `chore` | 빌드 및 설정 작업 | `chore/3-database-setup` |

최신 `main`에서 브랜치를 만드는 예시는 다음과 같다.

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/12-member-signup
```

## 4. 커밋 규칙

커밋 메시지는 다음 형식을 사용한다.

```text
종류: 변경 내용
```

| 종류 | 용도 |
| --- | --- |
| `feat` | 새로운 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `refactor` | 코드 구조 개선 |
| `test` | 테스트 추가 및 수정 |
| `chore` | 설정, 의존성, 빌드 작업 |
| `style` | 코드 동작에 영향 없는 서식 변경 |

예시:

```text
feat: 회원가입 API 구현
fix: 이메일 중복 검사 오류 수정
docs: 로컬 실행 방법 추가
chore: JPA 의존성 추가
```

- 한 커밋에는 하나의 논리적인 변경만 포함한다.
- `수정`, `작업`, `테스트`처럼 의미가 불분명한 메시지는 사용하지 않는다.
- 커밋 전에 불필요한 파일과 민감정보가 포함되지 않았는지 확인한다.

## 5. Issue 규칙

Issue 제목은 다음 형식을 권장한다.

```text
[영역] 작업 내용
```

예시:

```text
[BE] 기본 회원 기능 구현
[FE] 로그인 화면 UI 구현
[DOCS] API 문서 작성
```

Issue 본문에는 다음 내용을 작성한다.

- 작업 목적
- 구체적인 작업 목록
- 완료 조건
- 작업 범위에서 제외되는 내용
- 참고 자료 또는 디자인 링크

권장 Label:

- 영역: `backend`, `frontend`, `database`, `docs`
- 종류: `feature`, `bug`, `refactor`, `chore`
- 상태나 우선순위가 필요하면 팀 합의 후 추가한다.

## 6. Pull Request 규칙

PR 제목은 커밋 메시지와 같은 형식을 권장한다.

```text
feat: 기본 회원 기능 구현
```

PR 본문에는 다음 내용을 포함한다.

```md
## 변경 내용

- 구현하거나 변경한 내용을 작성한다.

## 테스트

- [ ] `./gradlew test` 통과
- [ ] 로컬 실행 확인

## 관련 Issue

Closes #12

## 참고 사항

- 리뷰어가 알아야 할 내용이나 스크린샷을 첨부한다.
```

- `Closes #이슈번호`를 작성하면 PR 병합 시 관련 Issue가 자동으로 닫힌다.
- UI 변경은 가능하면 변경 전후 스크린샷 또는 동영상을 첨부한다.
- 큰 PR은 기능 단위로 나누며, 관련 없는 변경을 함께 포함하지 않는다.
- 리뷰 의견을 반영한 뒤 해결 여부를 리뷰어에게 알린다.

## 7. 코드 및 디렉터리 규칙

프로젝트의 기본 구조는 다음과 같다.

```text
Oneuldo/
├── backend/    # Spring Boot 백엔드
├── frontend/   # 프론트엔드 애플리케이션
├── docs/       # 협업 및 설계 문서
└── README.md   # 프로젝트 소개와 주요 링크
```

백엔드 패키지는 역할별로 구분한다.

```text
oneuldo
├── controller
├── service
├── domain
├── repository
├── dto
├── config
└── exception
```

- Controller에는 요청과 응답 처리만 두고 핵심 로직은 Service에 작성한다.
- Entity를 API 응답으로 직접 반환하지 않고 DTO를 사용한다.
- 공통 예외 응답 형식과 API 명명 규칙은 기능 구현 전에 팀에서 합의한다.
- 코드 서식은 IntelliJ 기본 Java 코드 스타일을 우선 사용한다.

## 8. 보안 및 설정 파일 규칙

다음 정보는 Git에 커밋하지 않는다.

- 데이터베이스 비밀번호
- API Key 및 Access Token
- JWT 또는 Session 관련 Secret
- 개인 인증서와 키 파일
- `.env`
- `application-local.properties`

환경별 값은 환경변수로 전달한다.

```properties
spring.datasource.url=${DB_URL}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}
```

- 저장소에는 실제 값 대신 필요한 환경변수 이름과 설정 방법만 문서화한다.
- 민감정보를 실수로 Push했다면 파일만 삭제하지 말고 즉시 해당 키를 폐기하고 재발급한다.

## 9. 완료 기준

다음 조건을 모두 만족해야 작업이 완료된 것으로 본다.

- Issue의 완료 조건을 충족한다.
- 프로젝트가 정상적으로 빌드되고 실행된다.
- 관련 테스트가 작성되고 통과한다.
- 불필요한 캐시, 빌드 결과물, IDE 설정이 커밋되지 않는다.
- 필요한 문서와 API 설명이 갱신된다.
- PR 리뷰 의견이 반영되고 승인된다.
- PR이 `main`에 병합되고 관련 Issue가 닫힌다.
