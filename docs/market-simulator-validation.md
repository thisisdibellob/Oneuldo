# 장보기 합성 시뮬레이터 검증

확률 정책 A를 기본으로, 실제 모델이 매 행동을 결정하는 B를 선택할 수 있다. 기존 게임 어댑터·충돌·경로 탐색·트래커 매핑을 재사용한다. 생성 기본값은 로컬 JSONL이며 운영 백엔드 전송은 차단한다. 참고 브랜치는 병합하지 않았다.

## 동일 매장에서 페르소나별 30건, 총 90건

환경 시드 `validation-store-v1`, 배치 시드 `verification-v1`, 난이도 `family`, 워커 3개로 생성했다. 각 페르소나에 동일한 정책 시드 집합 `verification-v1:0`~`:29`를 사용했다. 모든 에피소드의 타입·출처·상태머신 재생·로그 매핑을 검증했다.

| 페르소나 | 구매 성공 | 판단시간 중앙값 | 에피소드당 장바구니 확인 | 잘못/초과 담기 비율 | 서로 다른 행동 시퀀스 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `mild-intellectual-disability-adult` | 30/30 | 3.040초 | 1.77회 | 3.3% | 30/30 |
| `careful-checker` | 30/30 | 2.160초 | 2.23회 | 0.0% | 30/30 |
| `quick-decider` | 26/30 | 0.666초 | 0.67회 | 20.0% | 30/30 |

판단시간은 이동을 제외한 가상 시간이다. 잘못/초과 담기 비율은 상품 추가 행동 중 목표 밖 상품이나 목표 수량 초과를 발생시킨 비율이다. 부족 수량은 이 지표에 포함하지 않는다. 정책 파라미터를 검증한 결과이며 실제 사람·장애 집단의 측정치가 아니다.

선호 차이도 관찰됐다. 꼼꼼한 확인형은 `milk-small` 20개와 `apple` 38개를 골랐고, 빠른 선택형은 `milk-small` 5개, `green-apple` 46개를 골랐다. 전체 상품별 집계는 [JSON 결과](market-simulator-validation.json)에 있다.

## 같은 페르소나에서 시드만 변경한 예

아래는 같은 매장·같은 `quick-decider`에서 실제 생성한 방문 순서와 상품 추가 내역이다. 반품 전 추가 수량도 포함한다.

| 정책 시드 | 방문 순서 | 추가한 상품 |
| --- | --- | --- |
| `verification-v1:0` | meal → fresh → produce → checkout → produce → checkout-2 | spicy-curry ×1, milk ×1, green-apple ×3 |
| `verification-v1:1` | meal → produce → fresh → checkout → meal → produce → checkout-2 | curry-spicy ×2, green-apple ×2, low-fat-milk ×1 |
| `verification-v1:2` | fresh → meal → produce → checkout-2 → staff:employee-1 → checkout | milk-small ×1, spicy-curry ×2, green-apple ×2 |

90건 모두 이동 거부 0건이며, 한 걸음의 최대 길이는 28.844px로 기존 32px 제한 이내다. 이동 시간은 거리와 보행 속도로 계산했다. 경로는 기존 경로 탐색으로 만들고 모든 이동을 기존 어댑터에 적용한다. 별도 테스트는 경로 충돌, 최대 속도, 같은 시드의 완전 동일 결과와 워커 1개/3개의 바이트 단위 동일 출력을 검사한다. 원시 좌표와 시각 샘플은 JSON 결과에 포함했다.

## 실제 백엔드 HTTP 검증

`SyntheticMarketBatchHttpTest`가 별도 H2 DB·합성 전용 사용자/JWT·임의 loopback 포트로 실제 Spring 서버를 실행했다. 생성 로그 50건을 `/api/behavior-logs/batches`에 POST한 결과 HTTP **200**, `events[].status` **ACCEPTED 50건**이었다. 동일 배치 재전송은 HTTP **200**, **DUPLICATE 50건**이며 DB 저장 건수는 50건을 유지했다. 모든 provenance의 저장을 확인했고 서버·DB는 종료됐다.

실행 중인 앱이나 실제 사용자 DB를 사용하지 않았다. 외부 AI 작업은 테스트에서 비활성화했다. 로컬 테스트 응답 원문은 `backend/build/reports/market-simulator-http-smoke.json`에 생성된다.

시뮬레이터 테스트 19건, 관련 프런트엔드 테스트 76건, 실제 HTTP 통합 테스트 1건 및 양쪽 TypeScript 검사를 통과했다.

## 재실행

저장소 루트에서 다음을 실행한다. 기본 출력 디렉터리에는 실행 시각이 붙으므로 이전 파일을 덮어쓰지 않는다.

```sh
npm --prefix market-simulator test
npm --prefix market-simulator run typecheck
npm --prefix market-simulator run verify
```

검증 스크립트가 출력한 디렉터리의 `http-smoke.json`을 아래 환경변수로 지정한다. 백엔드는 Java 25가 필요하다. 이미 한 번 생략된 테스트를 실행할 때도 환경변수 변경을 반영하도록 `--rerun-tasks`를 사용한다.

```sh
cd backend
MARKET_SIMULATOR_HTTP_FIXTURE=/absolute/path/to/http-smoke.json ./gradlew test --tests oneuldo.behaviorlog.controller.SyntheticMarketBatchHttpTest --rerun-tasks
```

LLM 경로는 로컬 모의 제공자로 매 스텝 HTTP 호출·오류 처리·호출 상한·요청/응답 기록·오프라인 재생을 검증했다. 실제 외부 모델 호출은 실행하지 않았으며, 실제 모델을 쓰려면 endpoint·model·키를 설정하고 `mode: "llm"`을 지정한다. [사용법](../market-simulator/README.md)과 [Codex 스킬](../market-persona-skill/SKILL.md)을 참고한다.
