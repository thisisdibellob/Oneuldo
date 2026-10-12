# 분석 품질 보완·페르소나별 15회 실험 인수인계

작성일: 2026-10-10 · 작업 경로: `/Users/bluem/Documents/GitHub/Oneuldo`

## 1. 현재 상태 — 먼저 읽기

**코드 수정과 새 실험 환경은 준비됐지만, 새 실제 플레이는 0/15회다. 최신 추천 v26의 실제 모델 재검증도 아직 하지 않았다. 따라서 이번 수정으로 추천 품질이나 학습 효과가 개선됐다고 결론 내릴 수 없다.**

사용자는 긴 작업 중 완료 여부가 명확하지 않은 점을 지적했고, 마지막으로 **새 세션에 넘길 인수인계 문서 작성**을 요청했다. 이 문서를 작성하면서 새 플레이·모델 요청은 실행하지 않았다. 다음 세션에서 기존 요청을 이어간다.

| 항목 | 확인된 상태 |
|---|---|
| 최신 백엔드 관련 자동 검사 | **109 PASS**, 실패·오류·SKIP 0. 실제 모델 호출을 대신하지 않음 |
| 새 기준선 프론트 검사 | **12 PASS**, `tsc --noEmit` PASS |
| 새 실험 계정·DB | 전용 계정 3개. 행동 로그·분석·프로필·추천 0개 |
| 민재·서연·민수 경험 | 각 관찰 에피소드 0개, 기억 연상 0개. 과거 실험 경험 미수입 |
| 최신 코드 실행 위치 | 로컬 격리 백엔드 `18130`과 전용 프론트 3개 |
| 학교 AI | 기존 인증 게이트웨이·Qwen 사용. 학교 게이트웨이 새 배포 없음 |
| Git | 변경 사항이 많고 미커밋 상태. 이번 요청에서 커밋·푸시하지 않음 |

브랜치: `9-ai-서비스-구현-jh-api` · 문서 작성 시 HEAD: `7526a8bcbdb5bc4db6a5296139aec12d36b01b10`.
현재 변경에는 이전 세션의 시간 제한·매대·분석 관련 작업도 섞여 있다. `git reset`, 일괄 정리, 기존 파일 삭제를 하지 않는다.

## 2. 다음 세션에서 이어갈 사용자 요청

1. 기존 테스트에서 발견한 분석·프로필·추천 오류를 보완하고 실제 AI로 확인한다.
2. **3페르소나 × (초기 기본 퀘스트 1 + AI 추천 퀘스트 3 + 같은 기본 퀘스트 재도전 1) = 실제 플레이 15회**를 수행한다.
3. 각 페르소나의 약점을 시험하도록 초기 기본 퀘스트를 다르게 설정한다. 개인 내 전후 기본 퀘스트는 동일해야 한다.
4. 분석 원문·추천 원문·실제 조건·성패·시간·문제점을 모아 추천 품질과 전후 수행 변화를 보고한다.
5. 학교 외장하드에 테스트 기록을 보관한다.

**실패 가능성이 있는 과제를 만든 것이며, 실패를 강제하거나 성공 순서를 정하지 않는다.** 초반에 성공해도 사실대로 기록한다. 실패하도록 행동·기억·시간을 조작하거나 실험 도중 기준선을 더 어렵게 바꾸지 않는다.

## 3. 이번에 고친 것과 남은 위험

| 문제 | 변경 | 아직 확인해야 할 것 |
|---|---|---|
| 사건 ID와 상품·수량·행동을 잘못 연결 | `ReadableSourceFacts`로 원본 값과 최종 장바구니를 읽기 쉬운 자료에 함께 제공. 작성 AI와 Review가 같은 원본을 받음 | 실제 모델의 인용 의미·최종 장바구니 해석. 전달 검사 통과가 의미 정확도 보장은 아님 |
| 같은 플레이 재분석을 반복 성공처럼 누적 | 프로필 출처 조상 연결까지 확인하고 중복 출처의 누적 문장을 제외. 서로 다른 원본 이력으로 재구성 | 실제 응답에 재현·유지·숙달 표현이 다시 생기는지 |
| 분석 대상과 실제 최신 플레이 순서 혼동 | 기록된 실제 시작·종료 시각을 사용. 시각이 없으면 순서 미확인 표시 | 과거 기록을 실제 전후 실험처럼 해석하지 않는지 |
| 일반 도움말을 직원 상담으로 기록 | 새 `SHOP.GENERAL_HELP_OPENED`와 실제 직원 상담을 구분. 과거 `viewHelp`는 원본 동작을 보존하여 해석 | 일반 도움을 직원 의존으로 쓰지 않는지 |
| 동일 안내·줄어든 품목 수를 지원 감소로 설명 | 추천 후보와 이전 실제 안내·환경·목표·예산·시간의 차이를 AI가 별도로 검토 | 같은 과제 반복 목적, 실제 지원 변화, 유지·전이 표현의 타당성 |
| 잘못된 숫자·누락 필드를 서버가 묵인 | 정수 원본 검증, 정확한 JSON 오류 경로 제공. 잘못된 `rationle`을 서버가 고치지 않고 AI 재작성 요청 | 실제 모델이 `description`, `environmentPlan.rationale` 등을 빠뜨리지 않는지 |
| 예산 6000→7000인데 “예산 유지”를 VALID로 승인 | AI가 원문 인용과 예산 변화 관계를 명시하고, 그 관계와 실제 원본 숫자가 모순이면 거절 | AI가 관계를 잘못 선택하는 의미 오류는 여전히 가능 |
| **추천 Review가 이전 실제 예산·목표를 못 읽음** | **v26에서 `LosslessHistoryEncoding.decodeHistory(...)`로 실제 이력 압축을 복원한 뒤 일치 검토에 전달** | 최신 v26 실제 모델 요청은 미실행. 가장 먼저 확인할 항목 |
| Review가 근거 없는 대안 객체를 생성 | 정확한 오류 경로와 대안 설명 규약을 재시도에 전달 | 새 실제 사례에서 형식·내용 모두 확인 |

중요한 마지막 버그는 단순 프롬프트 문제가 아니었다. 이력은 전용 압축 형식인데 추천 서비스가 일반 표 복원만 수행해 이전 mission/budget이 누락될 수 있었다. 올바른 AI 응답을 서버가 잘못 거절하는 원인이 됐다. **실제 이력 인코딩→서비스→Review 경로 회귀 검사**를 추가했으며, 테스트 준비 과정의 이중 인코딩 오류도 수정했다. 첫 실패 로그는 보존했다.

능력·성패·숙달 판단은 AI 몫이다. 서버 검사는 실제 ID, 정수 범위, 출처, 수량·가격 합계, 설명과 실제 조건의 사실 모순을 확인한다. 자동 능력 점수나 성공 횟수 기반 승급 규칙은 추가하지 않았다.

주요 코드:

- `backend/src/main/java/oneuldo/behaviorlog/analysis/service/{ReadableSourceFacts,FinalSourceEncoding,AnalysisSynthesisPrompt,AnalysisReviewPrompt,FinalAnalysisPromptCompactor,SourceEventDetails}.java`
- `backend/src/main/java/oneuldo/behaviorlog/profile/service/{AiUserProfileService,AiUserProfilePromptFactory,AiUserProfileReferences}.java`
- `backend/src/main/java/oneuldo/behaviorlog/personalization/service/{PracticeHistoryService,MarketAiQuestService,MarketAiQuestPromptFactory,MarketAiQuestValidator,MarketQuestConsistencyReview}.java`
- `frontend/src/behavior/marketBehaviorTracker.ts`, `frontend/src/screens/GamePrototypeScreen.tsx`

## 4. 검사와 실제 모델 결과를 혼동하지 않기

최신 v26 관련 **109개 검사**의 JUnit 결과는 `/private/tmp/oneuldo-ai-quality-decoded-history-build-20261010/test-results/test/`에 있다. 인수인계 시 로컬 기록 폴더에 요약·사본을 남긴다. 로그: `output/ai-quality-fixes-20261010/source-tests/gradle-decoded-history-run-02.log`.

앞선 버전의 넓은 검사에는 169 PASS·조건부 1 SKIP 등이 있다. 집중 검사와 합산 검사는 겹치므로 숫자를 더하지 않는다. 최신 v26 전체 저장소 검사나 실제 모델 품질 검사로 표현하지 않는다.

실제 AI 기록: `output/ai-quality-fixes-20261010/live-replay/`.

| 사례·실행 버전 | 실제 결과 | 해석 |
|---|---|---|
| 민재 기존 추천 1차 재분석, 분석 v36 | READY / SUCCESS, 약 **10분 24초** | 원래 잘못된 FAILURE는 바로잡음. “인지하고”, “예산을 고려”, “브리핑 확인” 등 관측보다 강한 표현이 남음. 새 플레이가 아님 |
| 위 입력의 추천 v22 | 추천 생성 성공 | 예산·시간 변경을 Review가 일부 놓침. 최신 v26 검증 아님 |
| 타이머 합성 입력 최초 검사 | 분석 FAILED | 만료 FAILURE 해석은 맞았지만 Review 대안 설명 근거 배열 오류 |
| 타이머 후속 분석 v37 | 분석 READY / FAILURE, 약 100초 | 합성 5사건 기술 입력. 실제 페르소나 플레이·학습 사례가 아님 |
| 타이머 추천 v23 | READY, 약 **68초**, 제한 시간 180→300초 | **예산 6000→7000을 “유지”로 설명했는데 Review가 VALID로 승인. 품질 통과로 세면 안 됨** |
| 타이머 추천 v24·v25 | FAILED / 503 | 필드 누락·Review 원본 출처 문제. 위 이력 복원 버그 발견 |
| **최신 추천 v26** | **실제 모델 재검증 미실행** | 자동 검사 109 PASS만 확인 |

`timer/`, `timer-final/`, `timer-v23/`, `timer-v24/`, `timer-v25/`, `minjae-r1/`의 분석·추천·감사 원문을 보존한다. 실패 응답을 소급해서 성공으로 바꾸지 않는다.

별도 기존 원본 3개 독립 Review 재생은 자동 승인 검토가 **보존된 내부 플레이 기록 3개를 외부 AI에 전송하는 명시적 승인 부족**으로 거절했다. `rejection-review.json`과 PREFLIGHT 결과를 보존했으며 우회하지 않았다. 이후 사용자가 요청한 **새 15회 실험으로 우선순위를 바꿨다**. 옛 3개는 실제 호출·새 학습 결과로 세지 말고, 새 15회를 위해 이 옛 요청의 승인을 다시 기다리지 않는다.

## 5. 최신 버전·격리 실행 환경

| 구성 | 값 |
|---|---|
| 분석 / 관찰 | `behavior-analysis-v37-source-contract-feedback` / `behavior-analysis-v34-readable-action-source` |
| 독립 분석 Review / 최종 입력 | `analysis-review-v29-source-contract-feedback` / `final-input-v8-support-boundaries` |
| 프로필 / 추천 | `incremental-user-profile-v19-distinct-play-source` / **`market-ai-quest-v26-decoded-history-review`** |
| 모델 | `qwen3.6:27b-q4_K_M`, 학교 GPU 1 |
| 컨텍스트 / 최종 분석 출력 | 18432 / 2400 tokens |
| 추천 생성 / 추천 Review 출력 | 1200 / 1100 tokens |
| 추천 재작성 | 최대 후보 3개, 구조가 유효한 각 후보당 Review 최대 1회 |
| 실험 폴더 | `output/persona-tailored-baseline-3-20261010/` |
| 실험 DB | `oneuldo_pilot_20261010_tailored3` |
| 백엔드 | `http://127.0.0.1:18130` · 확인 당시 PID **13321** |
| 프론트 | 민재 **18132**, 서연 **18134**, 민수 **18136** |
| AI 연결 | `http://127.0.0.1:18083` → 학교 `127.0.0.1:8081` |

실험 JAR: `output/persona-tailored-baseline-3-20261010/runtime-backend.jar`.
원래 빌드: `/private/tmp/oneuldo-ai-quality-decoded-history-build-20261010/libs/oneuldo-0.0.1-SNAPSHOT.jar`.
SHA-256: **`aff919c45a8d0e1a7aeac8e84b06c0300c1bc64252e3cfb4d64f31aef054d58b`**.
JAR 내부 v26 문자열과 `decodeHistory` 포함 여부를 실제 확인했다. `/private/tmp`가 정리돼도 실험 폴더 사본을 유지한다.

개인 설정은 `application-runtime.private.properties`, 실행 인수는 `backend-command.private.json`, 각 계정은 `group-01`~`group-03/account.private.json`에 있다. **내용을 출력·문서화·Git 업로드·외장하드 전송하지 않는다.** 로그인 UI에는 `loginId`가 아닌 저장된 **email + password**를 사용한다.

구형 타이머 런타임 `18120` / PID **12369**는 **추천 v25**다. 새 15회 런타임과 혼동하지 않는다. `output/ai-quality-fixes-20261010/restart-owned-runtime.py`도 아직 v25 JAR 경로를 가리키고 이전 PID 허용 조건이 낡아 있다. 그대로 실행하지 않는다.

기존 앱·다른 테스트 서버·학교 운영 서비스·방화벽·GPU 설정·집 노트북은 변경하지 않는다. PID는 바뀔 수 있으므로 종료 전에 포트·명령·개인 설정 경로로 소유권을 확인한다. 모든 Java/Node 프로세스를 일괄 종료하지 않는다.

게이트웨이 `/api/chat`의 `format`은 기존 허용 분석 스키마만 받는다. 임의 JSON 스키마나 `format:"json"`을 새로 적용한 적은 없다. 이번 작업을 새 structured-output 배포·파인튜닝·모델 교체라고 설명하지 않는다.

## 6. 새 페르소나별 기본 퀘스트

공통 환경 `tailored-shared-v1`: 매대 순서 **음료→식사→생활→신선→농산**, 기본 classic 구조, 직원 1·손님 1·기둥 1·계산대 2, 상품별 재고 6, 품절·공사·키오스크 없음. 같은 연구 기반 학습 규약을 사용한다.

| 페르소나 | 시험할 약점 | 공개 목표 | 예산 / 실제 목표 비용 |
|---|---|---|---|
| 민재 | 용량·묶음 단위와 구매 개수 구분 | 우유 900mL 2, 바나나 1송이 2, 즉석밥 210g 3개입 2, 생수 500mL 3 | 26000 / 23000원 |
| 서연 | 낯선 상품·매대에서 확인 순서 유지 | 해뜰 특란 15구 1, 오이 2개입 2, 야채만두 400g 2, 무가당 포도주스 1L 2 | 34000 / 30500원 |
| 민수 | 취향보다 요구 규격·개수 확인 | 초코우유 200mL 3, 해뜰 특란 15구 2, 순한 1인분 카레 3, 상품 카드 이름이 **‘사과’인 1개 제품** 2 | 29000 / 25800원 |

민수의 사과 조건은 숨은 정답으로 특정 품종을 거절하지 않도록 UI 요구에 명시했다. 각 기본 과제 **600초**. 성공 가능한 재고·예산을 갖추며, 기존 중립 안내 외에 정답 예시를 추가하지 않는다.

기준선은 `frontend/src/replay/pilotScenario.ts`, 공통 환경은 `frontend/src/replay/pilotEnvironment.ts`, 검사 파일은 `frontend/__tests__/MarketTailoredBaseline.test.ts`다. 개별 baseline 계약과 프로토콜은 실험 폴더의 `protocol.json`(v7), `authored-baseline-contracts.json`에 있다. `baseline-design-candidate.json`은 운영자 자료이며 배우 AI에게 전달하지 않는다.

초기 URL:

```text
http://127.0.0.1:18132/?marketReplay=1&marketPilotEnvironment=tailored-shared-v1&marketPilotScenario=TAILORED_MINJAE_BASELINE_V1&timingTest=tailored-minjae-pre
http://127.0.0.1:18134/?marketReplay=1&marketPilotEnvironment=tailored-shared-v1&marketPilotScenario=TAILORED_SEOYEON_BASELINE_V1&timingTest=tailored-seoyeon-pre
http://127.0.0.1:18136/?marketReplay=1&marketPilotEnvironment=tailored-shared-v1&marketPilotScenario=TAILORED_MINSU_BASELINE_V1&timingTest=tailored-minsu-pre
```

재도전은 자기 초기 과제·매대·재고·예산·제한 시간·안내를 그대로 반복하고 전체 조건 해시가 일치해야 한다. 추천 단계에서는 AI가 허용 범위의 목표·안내·매대·시간을 바꿀 수 있다. 개인별 기본 과제가 다르므로 세 사람의 절대 성공률·속도를 동일 난도 비교로 해석하지 않는다.

시간 정책 단일 원본: `shared/market/time-policy.json` — **최소 180 / 최대 600 / 기본 300초**. 실제 쇼핑 시작 버튼부터 측정하고 브리핑·분석 시간은 제외한다. 일찍 끝나도 강제로 기다리게 하지 않는다. 만료는 실제 종료 기록으로 남기며 결제 제출을 만들어내지 않는다.

## 7. 가상 사용자의 학습 경계

다음 자료부터 읽는다.

- `.agents/skills/market-persona-skill/SKILL.md`
- `market-persona-skill/assistant-learning-protocol.md`
- `market-simulator/personas/research-learning-{minjae,seoyeon,minsu}-v2.json`
- `docs/ai/research/intellectual-disability/learning-model-adjustment-2026-10-01.ko.md`

연구 L01~L08(논문 6개·공식 자료 2개)의 과제 분해, 안내, 반복·전이 구분을 참고한다. **메모리 JSON 구조와 회상 방식은 공학적 구현이며 실제 지적장애인의 임상적 학습 속도를 검증한 모델은 아니다.**

배우는 **Codex가 페르소나를 받아 직접 행동을 선택**하고 학교 Qwen은 분석·추천만 담당한다. 배우의 경험은 **실제 화면 영수증→본인이 작성한 짧은 잠정 연상→현재 화면에서 선택한 일부 회상→행동 선택**으로 이어진다. 오래된 전체 로그, 분석 원문, 프로필, 숨은 SKU 정답, 운영자 점수·전략을 배우 입력에 넣지 않는다.

실제 UI 이동·클릭·드래그로 플레이한다. 순간 이동·속도 변경·React 상태 직접 수정·허위 이벤트 업로드·확률 행동 대체는 사용하지 않는다. 자연스러운 성공과 실패를 모두 보존한다. 더 쉬운 목표·자세한 안내에서 성공한 사실만으로 능력 향상을 선언하지 않는다. 같은 날 재도전은 장기 유지 검사가 아니다.

민재 담당은 START를 받지 못했고 로그인만 수행했다. IAB `visible:true`는 서브에이전트에서 지원되지 않았고, `visible:false`로 만든 탭 1을 보존했지만 후속 조회에서 `Browser is not available: 2`가 발생했다. **다음 세션은 기존 탭이 살아 있다고 가정하지 말고, 실제 화면과 배우 세션을 새로 확인한다.** 현재 세션은 에이전트 스레드 한도도 걸렸으므로 새 세션에서 과제 내용을 미리 보지 않은 전용 배우 컨텍스트를 준비하는 것이 좋다.

## 8. 다음 세션 실행 순서

1. `AGENTS.md`·위 스킬·프로토콜을 읽고 `git status`를 확인한다. 새 세션의 배우에게 운영자 정답·감사 문서를 전달하지 않는다.
2. 아래 읽기 전용 연결 확인을 한다. 공유 SSH가 살아 있으면 다시 만들지 않는다.

   ```bash
   cd /Users/bluem/Documents/GitHub/Oneuldo
   ssh -S "$HOME/.ssh/oneuldo-school.sock" -O check -p 22022 duream@117.16.44.110
   curl --max-time 3 -fsS http://127.0.0.1:18083/healthz
   curl --max-time 3 -fsS http://127.0.0.1:18130/api/quest
   ```

   연결이 없으면 사용자가 **맥 터미널**에서 다음을 실행해 창을 열어둔다. 비밀번호는 채팅에 받지 않는다.

   ```bash
   ssh -M -S "$HOME/.ssh/oneuldo-school.sock" -N \
     -J jeonghoon@117.16.44.109:22022 \
     -p 22022 -o ExitOnForwardFailure=yes \
     -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
     -L 127.0.0.1:18083:127.0.0.1:8081 \
     duream@117.16.44.110
   ```

3. `runtime-artifact.json`의 JAR 해시·실제 프로세스·`implementation-hashes.json`을 확인한다. 읽기 전용 `harness.verify_source_freeze()`로 소스 고정을 확인한다. DB는 계정 3개, 행동·분석·프로필·추천 0개가 현재 기준이다. 계정 초기화·DB 재생성을 무작정 반복하지 않는다.
4. 먼저 v26의 실제 이력 전달·예산 출처·필드 누락 문제가 해결됐는지 확인한다. 선택적으로 기존 **5사건 타이머 합성 입력**을 재검증할 수 있다. 이 경우 `18120` 런타임을 소유권 확인 후 v26으로 올리는 준비가 필요하며, 현 `restart-owned-runtime.py`를 그대로 실행하면 안 된다. `live-replay.py timed timer-v26`은 준비 이후에만 사용한다. 기존 3개 원본의 별도 호출은 이 단계에 끼워 넣지 않는다.
5. 실제 15회 실험은 각 배우가 자기 기준선부터 UI로 시작한다. 화면·세션 연결을 남기고 앱이 실제로 끝낸 로그만 수집한다. 분석은 앱 자동 작업의 READY 및 해당 새 source/profile 연결을 확인한다.
6. 각 개인이 **실제 앱에서 생성한 추천 3개**를 순서대로 수행한다. 같은 모델 병렬 요청은 부담이 있으므로 분석·추천 호출은 순서를 조절한다. 실패한 생성은 기술 실패로 기록하며 고정 퀘스트로 대체하지 않는다. 진행 중 코드나 지원 조건을 바꾸면 별도 실험 조건으로 분리한다.
7. 자기 초기 기준선과 동일 조건으로 재도전한다. 실제 성패·상품/수량 일치·수정·도움 출처·시간·지원 조건을 원본에 대조한다. 운영자 목표 대조 지표와 AI의 능력 해석은 따로 보고한다.
8. 15회 실제 수행 여부와 9개 추천 체인의 완료 여부를 별도로 세고, 분석·추천 원문과 남은 문제를 보고한다. 중단되면 실제 완료 회수만 보고한다.
9. 종료·중단 기록을 외장하드에 보관하고 검증 영수증을 확인한다.

기록 도구는 실험 폴더에 있다. 아직 실제 `collect` 경로를 새 플레이로 실행하지 않았으므로 첫 플레이에서 실제 세션 연결·만료 종료 처리를 확인한다.

```bash
# UI 플레이 후에만 사용. round=0 기준선, 1~3 추천, 4 재도전.
python3 output/persona-tailored-baseline-3-20261010/harness.py collect --group 1 --round 0 --session <실제-세션-ID>
python3 output/persona-tailored-baseline-3-20261010/harness.py analyze --group 1 --round 0
python3 output/persona-tailored-baseline-3-20261010/harness.py summarize
```

`recommend` 도구는 운영자가 후보를 미리 만드는 용도가 아니며 비활성 경로다. 추천은 실제 앱 요청으로 한다. `learner-driver.py`, `session_linkage.py`, `session-linkage-cache.py`, `append-ui-episodes.py`, `apply-actor-context.py`는 실제 화면 기록과 본인 회상을 연결하는 보조 도구다.

## 9. 기록 위치와 보관

| 로컬 폴더 | 내용 |
|---|---|
| `output/persona-hard-baseline-3-20261010/` | 이전 완료된 15회. 민재만 기준선 실패→재도전 성공, 다른 두 사람은 처음부터 성공하는 천장효과. 새 실험으로 재분류 금지 |
| `output/ai-quality-fixes-20261010/` | 이번 코드 검사, 실제 기존 입력 재처리·타이머 분석/추천 원문·실패 기록 |
| `output/persona-tailored-baseline-3-20261010/` | 새 15회 프로토콜·기준선·계정·실행 준비. **실제 0회** |
| `output/quest-time-limit-20261010/` | 시간 제한 코드·실제 UI 만료 검사 및 최초 합성 분석 실패 |

이전 15회는 이미 외장하드에 **3347개 파일 SHA 검증** 후 보관됨:
`/mnt/wd_hdd/oneuldo/tests/persona-hard-baseline-3-20261010/927f259b1aa72112ed9f13290200ddff4ced4cceab8505483f85c97df8f79964`.

새 작업은 사용자 인수인계 요청에 따라 **interrupted** 상태로 보관했다. 이 상태는 퀘스트 실패가 아니다. 보관 확인서는 `output/.test-archives/<실행-폴더>/*.receipt.json`에 있고 **`state=archived` 및 `verified_files=file_count`**를 확인한 뒤만 완료라고 말한다.

문서 작성 시 외장하드 UUID·마운트·복사 후 SHA 검증을 통과한 이번 스냅샷은 다음과 같다. **총 361개 기록 파일**이며 개인 설정·비밀·바이너리·실행 스크립트 등 제외 파일은 전송하지 않았다. 다음 세션에서 기록이 추가되면 새 스냅샷을 보관한다.

| 실행 | 검증 파일 수 | `/mnt/wd_hdd/oneuldo/tests/<실행>/` 아래 스냅샷 ID |
|---|---:|---|
| `ai-quality-fixes-20261010` | 272 | `548435164f9d1c00cf34624766cf1589258fb0c60700ca4fde78185037e0a5fd` |
| `persona-tailored-baseline-3-20261010` | 35 | `835d29d29a0bcf034dffa4e085f174d3c55b20dc60cbcac92fc886792b61f6ec` |
| `quest-time-limit-20261010` | 54 | `ed3357d970cd03d0b957baf292606ffeef170bbf0ef158424c5e9b988785224e` |

```bash
python3 scripts/archive-test-records.py output/ai-quality-fixes-20261010 --status interrupted
python3 scripts/archive-test-records.py output/persona-tailored-baseline-3-20261010 --status interrupted
python3 scripts/archive-test-records.py output/quest-time-limit-20261010 --status interrupted
```

디스크 `/dev/sda1`, 마운트 `/mnt/wd_hdd`, UUID **B4E0414DE04116D0**를 확인한다. 인증·개인 설정·DB 덤프·모델/JAR·실행 스크립트를 보내지 않고 로컬 원본은 유지한다. 다른 SSD의 같은 이름 폴더에 대신 쓰지 않는다. 상세: [테스트 기록 보관](test-record-storage.md).

`docs/ai/quality-fixes-2026-10-10.md`는 이전 중간 보고서 골격이며 최신 v26 및 후속 실제 결과를 전부 반영하지 않았다. 다음 세션이 이 문서와 원문을 기준으로 갱신한다. 그 파일의 “대기”나 이전 합산 숫자만 읽고 현재 상태를 판단하지 않는다.

## 10. 새 세션에 붙여 넣을 요청

> `/Users/bluem/Documents/GitHub/Oneuldo/docs/ai/handoff-quality-and-tailored-persona-tests-2026-10-10.md`를 먼저 읽고 이어서 작업해줘. 최신 v26 실제 추천 검증부터 확인하고, 민재·서연·민수 각각 자기 기본 퀘스트 전후 1회씩과 실제 AI 추천 3회를 수행해 총 15회 테스트해줘. 실패·성공을 강제하지 말고 배우가 직접 행동을 선택하게 해줘. 분석·추천 원문과 품질 문제, 동일 기준선 전후 변화, 시간과 지원 조건을 정리하고 학교 외장하드에 기록을 보관해줘. 현재 새 플레이는 0회이고 계정 기억도 비어 있어.
