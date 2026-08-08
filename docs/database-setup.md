# 데이터베이스 실행 가이드

## 1. 데이터베이스 구성

오늘도 백엔드는 환경에 따라 다음 데이터베이스를 사용한다.

| 환경 | 데이터베이스 | 용도 |
| --- | --- | --- |
| 로컬 개발 | PostgreSQL | 애플리케이션 개발 및 실행 |
| 테스트 | H2 인메모리 DB | 자동 테스트 |

H2는 테스트에서만 사용한다.

## 2. 사전 준비

다음 프로그램이 필요하다.

- Java 25
- Docker
- Docker Compose

버전을 확인한다.

```bash
java -version
docker --version
docker-compose --version
```

## 3. 로컬 설정 파일 만들기

예제 설정 파일을 복사한다.

프로젝트 루트에서 실행한다.

```bash
cp backend/src/main/resources/application-local.properties.example \
   backend/src/main/resources/application-local.properties
```

`application-local.properties`는 개인 로컬 설정 파일이므로 Git에 커밋하지 않는다.

실제 DB 비밀번호도 파일에 작성하지 않고 환경변수로 전달한다.

## 4. PostgreSQL 실행

프로젝트 루트의 `infra` 폴더로 이동한다.

```bash
cd infra
```

로컬에서 사용할 DB 비밀번호를 환경변수로 설정한다.

```bash
export DB_PASSWORD='로컬에서 사용할 비밀번호'
```

PostgreSQL 컨테이너를 실행한다.

```bash
docker-compose up -d
```

실행 상태를 확인한다.

```bash
docker-compose ps
```

## 5. 백엔드 실행

`backend` 폴더로 이동한다.

```bash
cd ../backend
```

Docker를 실행할 때 사용한 것과 같은 비밀번호를 설정한다.

```bash
export DB_PASSWORD='Docker 실행 시 사용한 것과 같은 비밀번호'
```

`local` 프로필로 애플리케이션을 실행한다.

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

다음과 비슷한 로그가 출력되면 성공이다.

```text
HikariPool-1 - Start completed.
Successfully validated migration
Initialized JPA EntityManagerFactory
Tomcat started on port 8080
Started OneuldoApplication
```

실행 중인 애플리케이션은 `Control + C`로 종료한다.

## 6. 테스트 실행

테스트는 PostgreSQL이 아니라 H2 인메모리 데이터베이스를 사용한다.

따라서 테스트를 실행할 때 PostgreSQL 컨테이너가 없어도 된다.

```bash
cd backend
./gradlew clean test
```

다음 결과가 나오면 성공이다.

```text
BUILD SUCCESSFUL
```

## 7. PostgreSQL 종료

PostgreSQL 컨테이너만 종료한다.

```bash
cd infra
docker-compose stop
```

컨테이너를 다시 실행하려면 다음 명령어를 사용한다.

```bash
docker-compose start
```

## 8. 주의 사항

다음 정보는 Git에 커밋하지 않는다.

- 실제 DB 비밀번호
- `.env`
- `application-local.properties`
- API Key와 인증 토큰

저장소에는 실제 값 대신 예제 설정과 환경변수 이름만 기록한다.