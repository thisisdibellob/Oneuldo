# 손실 계산 메모리 보완 v3 — 2026-09-24

**전체 27B 모델의 세 스텝 시험 완료. 모두 성공했지만 최대 Torch 할당 감소는 약 125MiB이고 드라이버 여유 표본은 187MiB여서 충분한 여유를 확보하지 못했다.** 서버의 기존 AI 서비스를 잠시 중단한 통제 시험이며 본학습·어댑터 저장·운영 배포는 수행하지 않는다.

## 변경

기존 방식은 assistant 위치 전체에 대해 248,320개 어휘 logits와 FP32 교차 엔트로피 중간값을 한 번에 만들었다. 새 방식은 다음과 같다.

1. 동일한 Qwen backbone과 부착된 LoRA 레이어로 전체 입력을 처리한다.
2. 기존과 같은 shifted assistant 위치만 선택한다. 정답·종료 토큰을 자르지 않는다.
3. 32토큰씩 어휘 projection과 교차 엔트로피 합을 계산한다. non-reentrant checkpoint로 큰 어휘 중간 텐서는 역전파 시 다시 계산한다.
4. 각 묶음의 합을 **전체 정답 토큰 수로 나눈다**. 마지막 작은 묶음을 같은 비중으로 평균하는 오류를 피한다.
5. AdamW `foreach=False`로 optimizer의 임시 메모리 사용을 줄인다. rank 8·대상 모듈·학습률·FP16·NF4·gradient checkpointing·효율 attention은 유지한다.

메모리와 계산량의 절충이며 속도 향상을 보장하지 않는다. [PyTorch 2.10 checkpoint 설명](https://docs.pytorch.org/docs/2.10/checkpoint.html)에 따라 non-reentrant 재계산을 명시했다. 운영 모델이나 설치된 Transformers 패키지를 수정하지 않는다.

## 작은 수치 검증

GPU 1에서 FP32/FP16, 고정/학습 가능 출력 행렬, 묶음 크기 1/7/32/99의 **16개 조합**을 확인했다. 37토큰을 사용해 나누어떨어지지 않는 마지막 묶음도 검사했다. 기존 전체 손실 계산과 새 계산의 손실·입력 gradient·학습 가능한 head gradient가 허용 오차 내에서 일치했다. 허용 오차와 개별 오차는 [테스트 코드](test_chunked_loss.py)와 [실행 결과](loss-check.json)에 남겼다.

이 작은 검사는 전체 모델의 실제 최대 메모리를 대신하지 않는다. 새 학습 후보의 가장 긴 프로필/정답 T56(2,206토큰·정답 496토큰)과 가장 긴 세션 T18(3,557토큰·정답 338토큰), T18 반복을 서버에서 시험한다. 평가 25개는 업로드하지 않는다.

## 전체 모델 검증 결과

작업 경로는 `/home/duream/.local/share/oneuldo/qlora-memory-v3`, 결과 경로는 `attempt-05-chunked-v3`다. UUID로 물리 GPU 1만 노출한다. 종료·실패 시 Ollama와 게이트웨이를 복구하며 시험 시간은 최대 20분이다.

| 예제 | 토큰 / 정답 토큰 | 학습 시간 | 최대 Torch 할당 | 최대 Torch 예약 |
|---|---:|---:|---:|---:|
| T56 | 2,206 / 496 | 14.05초 | 20,669.40MiB | 21,374MiB |
| T18 | 3,557 / 338 | 23.75초 | 23,047.45MiB | 23,614MiB |
| T18 반복 | 3,557 / 338 | 23.38초 | 23,047.45MiB | 23,614MiB |

세 번 모두 유한 손실·gradient와 표본 LoRA B 갱신을 확인했다. 전체 프로세스는 105.24초였다. 기존 긴 예제의 최대 할당 23,172.80MiB보다 약 125.35MiB 작았고, 드라이버 여유 표본은 49MiB에서 187MiB가 됐다. 이 개선만으로 본학습에 충분한 여유가 생겼다고 판단하지 않는다.

Ollama·게이트웨이 모두 active와 복구 래퍼 health 성공을 확인했다. 다음으로 고정 입력 임베딩만 CPU로 옮기는 [추가 시험 v4](../memory-optimization-v4/README.ko.md)를 준비했다. [원문 결과](results/attempt-05-chunked-v3/smoke-result.json), [단계별 기록](results/attempt-05-chunked-v3/smoke-events.jsonl), [복구 기록](results/restoration.txt)을 보존했다.

 v2 시험과 입력 파일이 달라졌으므로 속도·loss 차이를 순수한 구현 개선량으로 해석하지 않는다. 같은 T18 길이의 메모리도 선행 예제가 달라 완전히 통제된 벤치마크는 아니다.

[입력 자료 보완 내용](../native-v3/README.ko.md) · [실행 파일 해시](SHA256SUMS) · [이전 메모리 시험](../memory-optimization-v2/README.ko.md)
