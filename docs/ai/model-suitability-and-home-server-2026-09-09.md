# 오늘도 모델 크기 비교와 노트북 API 서버 적합성

검토일: 2026-09-09. 현재 작업 트리의 코드·프롬프트·기존 실행 보고서와 모델 제공자의 공개 문서를 검토했다. 사용자의 ‘하이·로우’는 27B보다 큰 모델과 작은 모델의 비교를 뜻한다.

## 판단

**27B는 행동 해석·누적 프로필의 비교 기준으로 유지할 만하지만, 오늘도에 반드시 필요한 최소 크기로 입증되지는 않았다. 노트북에 상시 올릴 모델은 Qwen3.5-9B Q4_K_M을 우선 평가하고, 메모리·응답 시간이 부족하면 4B 또는 Qwen3-8B를 비교한다.** 27B보다 큰 모델로의 교체를 정당화할 프로젝트별 품질 측정은 아직 없다.

이는 코드와 하드웨어 제약에 근거한 후보 선정이다. 실제 레노버 노트북에서 모델 로딩·속도·품질을 측정한 결과가 아니다. 현재 작업 환경의 PATH에서는 `ollama` 실행 파일을 찾지 못했고, 대상 노트북의 추론 API 주소도 제공되지 않았다. 이번에는 모델 다운로드, 외부 추론 요청, 운영 설정 변경을 하지 않았다.

전제 장비는 i7-13650HX, 시스템 RAM 24GB, SSD 1TB, RTX 4060 Laptop 8GB다. GPU는 모델군의 [레노버 공식 사양](https://psref.lenovo.com/syspool/Sys/PDF/Legion/Legion_5_15IRX9/Legion_5_15IRX9_Spec.pdf)에 근거하며 개별 장비에서 재확인이 필요하다. Ubuntu로 부팅해 GPU를 직접 사용하는 구성이다.

## 1. 프로젝트가 실제로 요구하는 능력

현재 기본 모델은 `qwen/qwen3.6-27b`이며, 외부 생성 작업들이 같은 `GroqChatClient`를 사용한다. 모델명은 환경변수로 덮어쓸 수 있으므로 저장소 기본값이 실제 운영 설정을 증명하지는 않는다. [설정](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/resources/application.properties:38)

| 작업 | 코드에서 확인한 요구사항 | 크기 선택에 대한 판단 |
|---|---|---|
| 교통 퀘스트 문장 변형 | 원문·규칙·선택지의 의미를 유지한 짧은 한국어 | 4B~9B를 먼저 시험할 수 있다. 27B 필수 근거 없음 |
| 장보기 퀘스트 생성 | 분석 계획, 60상품, 규격·수량·가격·난이도·문장 제약을 함께 지킨 JSON | 8B~9B가 첫 후보. 4B도 가능 여부를 평가하되 단순 문장 생성과 동일시하지 않는다 |
| OBSERVE 구간 분석 | 시간·좌표·행동의 순서, 사실과 가설, 다른 설명, 근거 ID 보존 | 9B 대 27B를 실제 원사건으로 비교해야 한다 |
| REDUCE/FINAL 통합 | 요약 간 상충·반증·지원 맥락 보존, 성패 보류, 연습 목표 연결 | 27B 기준 모델을 남길 이유가 가장 크다 |
| 누적 프로필 갱신 | 이전 가설을 새 근거로 약화·보류하고 유효한 과거 관찰 유지 | 한국어 문장 유창성보다 추론·근거 일치 품질을 우선해야 한다 |

근거: [교통 생성](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/ai/service/QuestGenerationService.java:43), [장보기 프롬프트](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/personalization/service/MarketAiQuestPromptFactory.java:27), [행동 분석 프롬프트](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/analysis/service/AiBehaviorAnalysisPromptFactory.java:75), [프로필 갱신](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/profile/service/AiUserProfilePromptFactory.java:17).

작은 모델은 무조건 부정확하고 큰 모델은 정확하다는 판단은 할 수 없다. 세대·학습 방식·양자화·추론 설정이 모두 다르다. 공개 코딩·수학 점수는 오늘도의 한국어 행동 해석 정확도를 직접 측정하지 않는다.

## 2. 현재 문제 중 모델 크기와 분리해서 볼 부분

- 기본 요청 예산은 입력·예약 출력 합계 7,000토큰, 분석 구간/최종 출력은 각각 900토큰, HTTP 연결·응답 제한은 20초다. [현재 설정](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/resources/application.properties:43)
- 2026-09-08 기록에서는 556개 사건의 구간 관찰 11개를 재사용했지만 중간 통합 잘림과 일일 토큰 한도로 최종 갱신이 실패했다. 이는 모델 크기 부족을 증명하지 않는다. 이 수치는 당시 실행 기록이며 현재 공급자 요금제의 보편적 한도가 아니다. [실행 보고서](/Users/bluem/Documents/GitHub/Oneuldo/docs/ai/analysis-output-limit-update.md:25)
- 현재 긴 세션 경로의 FINAL은 AI 구간 요약과 ID·시각·사건 코드 등 참조 메타데이터를 받는다. 원본 전체를 다시 읽는 방식은 아니다. 앞 단계에서 중요한 맥락이 빠지면 마지막 모델만 키워도 복원할 수 없다. 짧은 입력의 직접 분석 경로는 별도다. [현재 통합 코드](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/analysis/service/AnalysisSynthesisPrompt.java:24)
- 이전 27B 합성 사례 V01에서는 정상 JSON이어도 사실에 가설을 섞고 미구현 음성 안내를 제안했다. 전체 24사례 실모델 비교는 해당 보고서 기준 미완료다. 프롬프트는 이후 변경됐으므로 이 기록은 현재 오류율이 아닌 회귀 평가 항목이다. [기존 품질 기록](/Users/bluem/Documents/GitHub/Oneuldo/docs/ai/phase-3-6-change-report.md:201)

따라서 더 큰 모델 구매보다 먼저 출력 예산, 실패 사유 전달, 의미 보존, 동일 조건 평가를 정리하는 편이 합리적이다. 큰 모델도 잘린 JSON과 전송되지 않은 근거를 자동으로 해결하지 못한다.

## 3. 노트북에 올릴 후보

아래 크기는 2026-09-09 공개 레지스트리의 **배포 파일 크기**이며 총 VRAM 사용량이나 실제 상주 RAM을 뜻하지 않는다. 멀티모달 배포본에는 비전 구성요소가 포함될 수 있다. 실행 시 캐시·계산 버퍼·운영체제·백엔드 메모리가 추가된다. 텍스트 입력, 요청 1개 기준으로 먼저 시험한다.

| 후보와 확인한 배포 태그 | 파일 크기 | 장비 적합성 추정 | 오늘도에서의 우선순위 |
|---|---:|---|---|
| `qwen3.5:4b-q4_K_M` | 3.4GB | 8GB GPU에서 상대적으로 여유 있는 후보 | 가벼운 퀘스트/API, 속도 우선 비교군 |
| `qwen3.5:4b-q8_0` | 5.3GB | Q4보다 양자화 손실을 줄이는 비교 후보. 실행 여유 확인 필요 | 9B Q4와 품질·속도 비교 가치 있음 |
| `qwen3:8b-q4_K_M` | 5.2GB | 9B보다 파일이 작아 메모리 대안 | 9B가 메모리/지연 목표를 못 맞출 때 |
| `qwen3.5:9b-q4_K_M` | 6.6GB | GPU 8GB에서 여유가 작음. 일부 CPU 분산이나 문맥 조정 가능성 | **상시 로컬 모델 1차 평가 후보** |
| `qwen3:14b-q4_K_M` | 9.3GB | 전부 GPU에 올릴 수 없어 CPU·RAM 분산 필요 | 9B보다 실무 품질이 나은지 검증하기 전에는 우선순위 낮음 |
| `qwen3.6:27b-q4_K_M` | 17GB | CPU·GPU 혼합 실행 후보. 24GB RAM에서 다른 서비스와 경쟁 | 현재 모델과의 비교·비동기 분석용 실험 |
| `qwen3.8:27b` (현재 Q4_K_M) | 18GB | 27B와 유사한 제약. 기본 태그 변경 가능하므로 digest 고정 필요 | 더 큰 모델을 사기 전 같은 크기의 신세대 비교 후보 |
| `qwen3.6:35b-a3b-q4_K_M` | 24GB | 총 메모리 여유가 매우 작아 상시 운영 비추천 | 별도 메모리 많은 장비에서 비교 |

파일 크기 출처: [Qwen3.5 태그](https://ollama.com/library/qwen3.5/tags), [Qwen3 8B](https://ollama.com/library/qwen3:8b-q4_K_M), [Qwen3 14B](https://ollama.com/library/qwen3:14b-q4_K_M), [Qwen3.6 태그](https://ollama.com/library/qwen3.6/tags), [Qwen3.8 27B](https://ollama.com/library/qwen3.8:27b).

35B-A3B는 총 35B 중 토큰마다 약 3B를 활성화하는 MoE다. 계산량이 적을 수 있지만 3B 모델처럼 가중치 저장량까지 작아지는 것은 아니다. 35라는 숫자만으로 27B보다 오늘도에 더 정확하다고 판단할 수도 없다. [공식 모델 설명](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)

70B급 dense나 Qwen3.5-122B-A10B급은 현재 장비의 상시 서버 후보에서 제외한다. 70B를 이상적인 4비트로 계산해도 가중치만 약 35GB이며 추가 메모리가 필요하다. 122B MoE도 활성 파라미터 수만으로 메모리를 계산하면 안 된다. [122B 공식 모델](https://huggingface.co/Qwen/Qwen3.5-122B-A10B)

이미 프로젝트에 있는 Bllossom 3B는 Android 온디바이스용 후보이지, 서버의 긴 분석 작업에 적합하다고 검증된 모델이 아니다. [기존 배포 구성](/Users/bluem/Documents/GitHub/Oneuldo/docs/bllossom-model-setup.md:1)

## 4. 추천 운영 방향

1. **완전 로컬을 우선하면:** Qwen3.5-9B Q4를 먼저 올려 실제 퀘스트·분석 입력으로 시험한다. 처음부터 모든 분석을 교체하지 않고 별도 평가 결과를 저장한다. 9B가 메모리/지연을 넘기면 Qwen3-8B Q4와 Qwen3.5-4B Q4/Q8을 비교한다.
2. **품질 비교 기준을 유지하려면:** 기존 27B의 출력과 같은 입력으로 대조한다. 27B를 유일한 정답 판정자로 사용하지 않는다. 원사건과 사람 검토를 기준으로 삼는다.
3. **27B를 노트북에서 쓴다면:** 동시 요청 1개, 백그라운드 분석으로 평가한다. 앱의 즉시 응답 경로 전체를 맡기지는 않는다. 다른 모델도 함께 상주시키면 메모리 경쟁이 생기므로 순차 로딩/별도 실행으로 비교한다.
4. **더 큰 모델은:** 9B·27B가 같은 의미 오류를 반복하고 큰 모델이 그 오류를 실제로 줄일 때 외부 GPU/API 비용을 검토한다. 현재는 크기 확대를 먼저 선택할 근거가 없다.

하드웨어 구입은 9B의 실제 사용량 측정 후 판단한다. RAM을 늘리면 CPU 분산 실행의 여유는 늘지만 RTX 4060의 VRAM이나 CPU 메모리 대역폭이 GPU 수준으로 바뀌지는 않는다.

## 5. 로컬 API 연결 전에 필요한 코드 변경

현재 코드에 주소·모델명만 넣는 방식으로의 즉시 교체는 권하지 않는다.

| 항목 | 현재 상태 | 필요한 변경 |
|---|---|---|
| API 경로·본문 | `/openai/v1/chat/completions`, Groq 전용 `reasoning_format`, `reasoning_effort` | Ollama의 `/v1/chat/completions` 또는 native `/api/chat`에 맞는 어댑터 |
| 응답 제한 | Groq 20초 | 로컬 첫 로딩·입력 처리·생성을 각각 측정하고 제한/큐 설정. 무한 대기는 피함 |
| 호출 속도 제어 | 모든 요청에 Groq TPM/RPM pacer 적용 | 로컬 동시성 큐와 공급자 quota 제어를 분리 |
| 토큰 계산 | Qwen3.6-27B 토크나이저 파일 고정 | 실제 모델과 채팅 템플릿 기준으로 검증/교체 |
| 문맥 길이 | 요청 예산 7,000토큰 | 우선 8,192 context로 예산 정합성 시험. 4,096으로 줄이면 입력 분할 예산도 같이 줄여야 함 |
| 출력 길이 | 분석/프로필 900토큰, 장보기도 900 | 로컬에서는 단계별 1,200~1,800 등을 실험하되 입력+출력 합계 재계산 |
| 추론 모드 | 현재 요청은 `reasoning_effort=none` | 모델·엔진별 thinking 설정을 명시. 기본값에 맡기면 출력·시간 비교가 불공정해짐 |
| JSON | 프롬프트로 요구 후 Java 검증 | 엔진의 JSON schema 지원을 활용하되 의미·상품·근거 검증 유지 |
| 캐시 | 체크포인트 키에 모델명이 포함됨 | 제공자, 정확한 모델 revision/digest, 양자화, 템플릿, 추론 옵션까지 구분 |

코드 근거: [REST 클라이언트](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/ai/client/RestGroqChatClient.java:39), [토크나이저](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/analysis/service/QwenTokenCounter.java:15), [체크포인트](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/analysis/service/AnalysisCheckpointStore.java:29).

Ollama의 [호환 API](https://docs.ollama.com/api/openai-compatibility)는 기존 공급자 전용 옵션까지 동일하게 지원한다는 의미가 아니다. [메모리·동시성 안내](https://docs.ollama.com/faq)에 따라 context와 parallel 수를 함께 관리한다. Qwen3.8은 기본 thinking이 켜져 있으므로 현재 non-thinking 요청과 구분해서 비교한다. [Qwen3.8 공식 모델](https://huggingface.co/Qwen/Qwen3.8-27B)

분석 작업에는 이미 비동기 job/진행 조회 경로가 있다. 프론트의 15초 상태 조회 타임아웃을 분석 전체의 제한으로 오해하면 안 된다. 반면 교통 문장 생성에는 25초 프론트 제한이 별도로 있어 백엔드 제한만 늘리면 충분하지 않다. [분석 상태 조회](/Users/bluem/Documents/GitHub/Oneuldo/frontend/src/api/behaviorAnalysis.ts:115), [교통 생성 요청](/Users/bluem/Documents/GitHub/Oneuldo/frontend/src/api/cloudQuestGeneration.ts:34)

## 6. 실제 채택을 결정할 평가

다음은 제안하는 평가 절차이며 실행 완료 결과가 아니다.

- 기존 [합성 사례 24개](/Users/bluem/Documents/GitHub/Oneuldo/shared/evidence/synthetic-cases.json:1)를 개발 검토용으로 사용한다. `expert_validated=false`이므로 전문적 정답 데이터나 학습 데이터로 간주하지 않는다. 품절·직원 문의처럼 현재 앱 밖의 사례는 불가능 기능을 권하지 않는지 평가하는 항목으로 분리한다.
- 짧은 사례 외에 긴 사건 흐름, 목록 재확인 후 성공, 조작 지연, 뒤늦은 수정, 프로필과 새 관찰의 충돌을 넣는다. 현재 생산 프롬프트와 실제 Java validator로 단일 단계와 전체 체인을 모두 평가한다.
- 1차는 4B Q4·9B Q4·현재 27B를 같은 입력, 동일한 출력 계약, 명시한 non-thinking 조건으로 비교한다. 27B 로컬 양자화본과 Groq 제공본은 양자화/런타임이 다르므로 결과를 별도 기록한다. 9B가 불합격이면 8B 또는 27B 신세대를 추가한다.
- 근거 없는 능력 단정, 사실/가설 혼동, 상충 근거 누락, 근거 ID가 실제 문장을 지지하는지, 미구현 기능 제안, 상품·수량·예산 위반을 각각 검토한다. 정상 JSON·실제 ID만으로 의미 품질을 통과시키지 않는다.
- 최종 퀘스트가 프로필의 연습 목표와 연결되는지 확인한다. 가장 큰 모델의 답과 같다는 이유로 정답 처리하지 않는다.
- cold/warm 지연, 입력 처리 시간, 출력 토큰/초, 전체 세션 완료 시간, 재시도 수, peak RAM/VRAM, swap과 장시간 발열을 기록한다. 서로 다른 모델의 토큰/초만으로 속도 우열을 결정하지 않고 같은 한국어 작업의 총시간도 비교한다.
- 제안 목표는 짧은 퀘스트 warm p95 10초 이내, 구조·게임 제약은 재시도 포함 100% 통과, 평가집에서 중대한 근거 없는 단정 0건이다. 이는 프로젝트의 기존 요구사항이나 정확도 보장이 아닌 초기 채택 기준이다. 긴 세션은 전체 완료 시간을 따로 합의한다.

기존 `run-synthetic-ai-review.mjs`는 Groq 주소·옵션에 결합되어 있으며 현재 전체 분석 체인을 재현하지 않는다. 그대로 실행한 결과를 새 로컬 모델의 종합 평가로 표시하면 안 된다. 이번 검토에서는 해당 스크립트를 실행하지 않았다.

최종 후보는 **9B Q4 로컬 API를 먼저 측정 → 메모리/지연이 안 맞으면 4B·8B → 행동 분석 품질이 부족하면 27B 경로 유지**다. 더 큰 모델은 이 비교에서 확인된 구체적인 품질 부족을 해결하는지 검증한 뒤 선택한다.
