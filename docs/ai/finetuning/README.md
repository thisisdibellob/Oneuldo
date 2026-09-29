# AI 학습 자료와 실험 기록

정리 기준: 2026-09-29. 이 디렉터리는 연구 참고 자료를 바탕으로 작성한 합성 학습 후보, 입력 변환·검증 도구, GPU 학습 시험 및 전후 평가 기록을 보관한다. 운영 모델 설정 파일이 아니다.

## 현재 결론

**최종 목표는 근거 있는 분석과 맞춤 퀘스트를 제공하고, 실제 사용자가 반복해서 플레이했을 때 목표 수행이 향상되는지 확인하는 것이다.** 분석 형식 통과만으로 이 목표를 달성했다고 판단하지 않는다. [학습 목적과 다음 설계](learning-objective-and-next-design.ko.md)에 합의된 방향을 정리했다.

첫 27B QLoRA 실험은 학습 60개와 전후 평가 각 25개를 완료했지만, 앱 검증기 통과가 **25/25 → 19/25**로 악화됐다. 최종 어댑터는 운영에 적용하지 않았다. 2026-09-25 실험 종료 시 기존 서비스 복구와 실제 공개 API 응답을 확인했다. 이는 당시 확인 기록이며 서버의 현재 실시간 상태를 뜻하지 않는다.

먼저 읽을 문서:

1. [첫 본학습 비교 보고서](full-training-v1/comparison-report.ko.md)
2. [학습 전후 50개 응답 원문](full-training-v1/model-responses.ko.md)
3. [사례별 정성 검토](full-training-v1/semantic-review.json)
4. [현재 동결된 학습 60개·평가 25개 설명](native-v3/README.ko.md)
5. [문헌 자료와 읽은 범위](../research/README.md)

## 자료의 역할과 이력

| 위치 | 내용 | 해석할 때 주의할 점 |
|---|---|---|
| `seed-v1/` | 최초 합성 예제, 문헌 카드, 내용 검토 | 초기 초안 상태를 보존한 기록 |
| `contract-v1/`, `baseline-v1/` | 앱 계약 대응·초기 평가 | 최신 실험과 입력/조건이 다름 |
| `native-v2/`, `baseline-native-v2*`, `pretraining-review-v1/` | 실제 프롬프트 경로 대응, 운영 모델 평가, 분포 검토 | 운영 Ollama 결과를 HF 전후 비교와 혼합하지 않음 |
| `native-v3/` | 보완한 학습 60개와 동결 평가 25개 | 전문가 검토·교육 효과가 입증된 정답이 아닌 합성 후보 |
| `training-preflight-v1/`, `memory-optimization-v2/`~`v4/` | 설치·실행·메모리 시험과 실패 기록 | GPU에서 학습 가능한지의 검사이며 품질 검증과 다름 |
| `full-training-v1/` | 60스텝 학습, 전후 25건 평가, 실패/복구 이력 | 현재 최종 비교 결과. 운영 적용 보류 |
| 루트의 `build_*`, `audit_*`, `test_*` | 생성·검토·오프라인 회귀 검사 | 작성기/내보내기로 동결 입력을 덮어쓰지 않음 |

이전 버전과 실패 시도를 삭제하지 않았다. 각 문서의 날짜와 버전이 당시 상태를 설명한다. 실제 개인 로그나 논문 참여자의 행동을 복제한 자료가 아니며, 장애명으로 행동을 고정하거나 실제 교육 효과의 증거로 해석하지 않는다. 기존 25건은 이미 결과를 검토한 개발 평가이므로 독립적인 미공개 평가가 아니다.

## 로컬 확인 방법

저장소 루트에서 Python 데이터·변환 회귀 검사를 실행한다. 서버 연결이나 GPU가 필요하지 않다.

```bash
python3 -m unittest discover -s docs/ai/finetuning -p 'test_*.py' -v
```

Java 25를 사용할 수 있는 환경에서는 저장된 전후 응답을 실제 앱 파서·검증기에 다시 넣을 수 있다. 새 모델 추론이나 서버 호출은 하지 않으며 `production-validation.json` 보고서를 다시 쓴다.

```bash
ONEULDO_CHECK_MATCHED_COMPARISON=true \
ONEULDO_EXPORT_NATIVE_DIR=../docs/ai/finetuning/native-v3 \
backend/gradlew -p backend test --rerun \
  --tests oneuldo.behaviorlog.profile.service.FinetuningMatchedComparisonTest
```

검증 도구의 테스트 성공과 모델 응답 전체 통과는 다르다. 전후 실제 통과 수는 각각 `full-training-v1/results/{before,after}/production-validation.json`에서 확인한다. 결과 요약은 아래 명령으로 재생성한다.

```bash
python3 docs/ai/finetuning/full-training-v1/summarize.py
```

GPU 시험 스크립트는 과거 실험 재현용이며 서버 경로와 GPU UUID에 의존한다. 실행하면 서비스 중단과 장시간 학습이 발생할 수 있으므로 위 오프라인 확인 명령과 구분한다. 이 정리 작업에서는 서버 시험을 다시 실행하지 않았다.

## 저장 범위

문헌 목록·검토 문서, 합성 데이터, 실행 코드, 평가 원문과 실패 기록을 Git에 보관한다. 모델 원본·어댑터 가중치·가상환경·인증 키는 포함하지 않는다. 로컬 어댑터는 Git에서 제외된 `output/qlora-full-training-v1/adapter-step-060/`에 별도로 있으며 체크섬은 비교 보고서에 기록돼 있다. 일반 `.log` 파일과 Python 캐시는 기존 `.gitignore`에 따라 제외된다. Git에는 구조화된 `events.jsonl`, 결과 JSON, 복구 기록을 보존한다.
