# 원본 근거와 문장 단위 검토

현재 실패 사례와 수정 순서는 [AI 판단·검증 문제 관리](analysis-issues.md)에서 추적한다. 이 문서의 설계 설명과 부분 검사 결과를 전체 분석 품질의 보장으로 해석하지 않는다.

분석 프롬프트 `behavior-analysis-v26-claim-arrays`, 검토 프롬프트 `analysis-review-v13-claim-arrays`를 사용한다. 근거가 없는 대안 설명을 빈 배열로 허용하는 기존 정책은 관측·통합·최종 분석·누적 프로필 프롬프트와 검증기에 동일하게 적용한다. 알 수 없는 동기나 이해도는 `uncertainties`에 적는다. 프론트는 빈 대안 설명 제목을 표시하지 않는다.

## 원본과 AI 판단의 경계

`sourceEventDetails`에 사건의 `sequence`, 시각, 상품, 수량과 장바구니 원본 값을 함께 전달한다. AI에게 여러 사건을 한 동작으로 합치지 말고 사건별 절로 설명하도록 요청한다. 기존 로그나 실제 사용자의 프로필은 이 변경으로 수정되지 않는다.

Ollama 분석은 기존 검토 호출을 사용한다. 별도 호출을 상시 추가하지 않는다. 검토 입력은 이전 초안을 복사하기 쉬운 완성 JSON 대신 수정 대상 주장 목록으로 전달한다. 구간 관찰과 한계는 보존하되 중간 단계의 추측을 반복해서 주입하지 않는다.

검토 모델의 내부 출력은 `reviewFormat=claim-evidence-v2`이다. 각 주장에 `{text, evidenceEventIds}`를 함께 작성하며 별도 `claimChecks`는 생성하지 않는다. `summary`, `observation`, `interpretation`, `alternativeExplanations`, 세션 `explanation`은 모두 문장 객체 배열이다. 한 문장이어도 배열을 사용하며, 여러 문장을 하나로 줄이거나 버리지 않는다. `observation`은 사건 순서를 보존한다. 같은 사건을 관찰 절 여러 곳에 중복 인용하지 않는다. `suggestedSupport`, `uncertainties`, `practicePlan`의 기존 의미와 형식은 유지한다.

서버의 `ReviewedClaimOutput`은 다음만 수행한다.

- 필수 필드와 형식, 원본 사건 존재, 근거 누락·중복·순서 검사.
- AI가 작성한 관찰 문장 앞에 해당 객체의 `(E번호)`를 표시하고 순서대로 연결.
- AI가 각 문장에 선택한 근거의 합집합으로 공개 응답의 finding 근거 목록 구성.
- 세션 설명의 근거를 공개 응답의 세션 근거 목록으로 전달.

문장의 의미·지원·성패를 수정하거나 새 근거를 추론하지 않는다. `text`에 사건 ID를 다시 적거나, finding에 별도 근거 목록을 추가하거나, 예전 검토표를 혼합하면 거부한다. 출력이 충돌할 때 서버가 임의로 한쪽을 선택하지 않는다. 화면·프로필이 사용하는 공개 분석 응답 형식은 유지하고, 원래 문장별 근거는 감사 기록의 모델 원본 응답에 보존한다.

요약은 계속 원본 전체에서 독립적으로 근거를 선택한다. 미션·세션 시작이 하위 finding에 없어도 요약에 사용할 수 있다. 존재하지 않는 사건과 관찰 절의 순서 역전은 거부한다. 문장 객체의 형식·근거 오류는 시도 감사 기록의 `validationFailure`에 `code`, `path`, `offendingIds`로 남기고 재시도에 전달한다. JSON 파싱이나 최종 게임 설정 검증까지 모든 오류가 상세화된 것은 아니다.

이전 형식의 `ReviewEvidenceChecks`와 `reviewedLegacyAnalysis`는 저장된 응답 재현 검사에 남겨 둔다. 실제 검토 파이프라인은 새 형식만 받고, 예전 형식으로 자동 되돌아가지 않는다. 요청의 관측 JSON 스키마는 바뀌지 않으며 검토 호출은 기존 일반 생성 경로를 사용하므로 학교 게이트웨이 재배포는 필요하지 않다. 백엔드는 재시작해야 적용된다.

이 검사는 **문장의 의미가 사실이라는 증명이 아니다**. 실제 이해·의도, 성공·실패, 필요한 지원은 AI가 판단한다. 서버는 문장을 고쳐 쓰거나 성패·능력 점수를 계산하지 않는다. 구조 검사가 실패하면 기존 제한된 재시도 정책을 사용하며, 끝까지 실패하면 검토 전 초안을 완료 결과로 내보내지 않는다.

## 게이트웨이 배포 순서

새 관측 JSON 스키마는 `alternativeExplanations.minItems=0`이다. 기존 설치 게이트웨이는 `minItems=1` 스키마만 받으므로 **게이트웨이를 먼저 교체하고 백엔드를 재시작**해야 한다.

새 게이트웨이는 정확히 두 버전의 스키마만 허용하고, 호출자가 요청한 버전을 Ollama에 그대로 전달한다. 기존 팀원 백엔드는 계속 구버전 스키마를 쓸 수 있다. 임의 스키마, 관리 API, 임의 모델/서버 주소 허용 범위는 확대하지 않는다.

학교 게이트웨이는 2026-09-18 교체하고 신규 스키마의 실제 AI 응답을 확인했다. 배포 원본 스크립트는 `ai-gateway/deploy/update-schema.sh`이며, 빌드와 패키지 준비 방법은 [게이트웨이 README](../../ai-gateway/README.md#기존-게이트웨이-업데이트)를 따른다. 서비스 교체 전 진행 중인 요청이 없는지 확인한다. 백업, 상태 확인, 실패 시 복원이 포함된다. JAR 교체는 GPU·Ollama·Caddy·방화벽이나 집 노트북 설정을 바꾸지 않는다.

## 실제 모델 회귀 검사

`ClaimEvidenceSchoolLiveTest`는 `AI_CLAIM_EVIDENCE_LIVE=true`일 때만 실행한다. 저장된 208개 사건의 잘못된 초안을 원본과 재검토한다. `AI_CLAIM_MODE=paired`는 3개 사건만 남긴 명시적인 비교용 입력 두 개를 사용한다. 두 입력의 상품/수량/이벤트는 같고, 장바구니 열기와 수량 변경의 순서만 바꾼다. 원래 순서를 전제로 하는 장바구니 스냅샷 등은 두 입력에서 동일하게 제외한다. 두 조건 각각 3회 호출하며 캐시를 사용하지 않는다.

이 테스트는 저장된 합성 플레이 로그를 사용한다. 실제 장애 당사자 실험이나 교육 효과 검증이 아니다. DB에 로그/분석/프로필을 쓰지 않는다. 출력 파일의 `structurallyValid`는 위 구조 검사 통과 여부이며 품질 합격 점수가 아니다. 내용의 사실성은 원본과 별도로 비교해야 한다.

```bash
cd backend
AI_CLAIM_EVIDENCE_LIVE=true AI_CLAIM_OUTPUT=../output/attached-evidence-review ./gradlew test --tests '*ClaimEvidenceSchoolLiveTest'
AI_CLAIM_EVIDENCE_LIVE=true AI_CLAIM_MODE=paired AI_CLAIM_OUTPUT=../output/attached-evidence-paired ./gradlew test --tests '*ClaimEvidenceSchoolLiveTest' --rerun-tasks
```

Java 25 및 로컬 테스트 자료, `local.properties`의 학교 API 키가 필요하다. 키는 테스트 산출물에 저장하지 않는다. 기존 v10 결과는 `output/ai-claim-evidence-2026-09-17`에 보존한다. 새 실험은 `AI_CLAIM_OUTPUT`에 별도 출력 디렉터리를 지정해 기존 결과를 덮어쓰지 않는다.

새 `tmp/`·`output/` 산출물은 Git에서 제외한다. 실제 모델 검사와 저장 응답 재생 검사는 로컬 실험 자료가 있어야 실행할 수 있으며 기본 테스트에서는 건너뛴다. 커밋된 검사 요약과 남은 한계는 [검증 기록](validation-2026-09-18.md)에 정리한다.
