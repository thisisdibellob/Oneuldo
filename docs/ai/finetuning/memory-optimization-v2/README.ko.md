# 긴 예제 QLoRA 메모리 재시험 — 2026-09-24

**재시험 완료. 메모리 정리만 적용한 설정은 3,557토큰에서 OOM이었지만, 효율 attention 설정은 2,044토큰 1회와 3,557토큰 2회 모두 역전파·LoRA 갱신에 성공했다. 기존 AI 서비스를 복구하고 인증된 모델 응답을 확인했다. 다만 메모리 여유가 매우 작아 전체 학습의 안정성까지 확인한 것은 아니다.**

## 변경한 부분

1. 매 스텝 종료 시 gradient를 `None`으로 바꾸고, gradient 리스트와 출력·손실 텐서 참조를 해제한다. 사용하지 않는 allocator cache도 반환한다. 기존 코드의 gradient 리스트가 다음 스텝까지 이전 텐서를 보유할 수 있었던 문제를 제거했다.
2. `PYTORCH_ALLOC_CONF=expandable_segments:True`를 사용한다. 이것만으로 메모리 부족이 해결된다고 가정하지 않는다.
3. 별도 비교 설정에는 KV head를 명시적으로 반복한 뒤 Torch `EFFICIENT_ATTENTION`만 사용하도록 한 attention 함수를 등록한다. PyTorch 2.10의 직접 GQA 경로는 이 GPU의 효율 커널에서 실행되지 않았지만, KV 반복 경로는 실행됐다. 메모리 사용이 큰 math 경로로 조용히 돌아가지 않도록 강제했다.
4. Transformers의 기존 SDPA 마스크 생성기를 재사용하여 causal/padding 처리를 보존한다. 등록은 시험 프로세스 내부에서만 한다. 서버의 설치된 라이브러리나 운영 추론 코드를 수정하지 않는다.

두 비교 모두 같은 원본, NF4, FP16, rank 8, batch 1, 학습률, target module, seed를 사용한다. 가장 긴 프로필 T54(2,044토큰), 가장 긴 세션 T18(3,557토큰), T18 반복의 순서로 최대 3스텝 실행한다. 반복 단계로 optimizer 상태가 존재하는 상태에서 긴 예제를 다시 확인한다. 전체 문장과 assistant 손실을 유지하며 평가 자료는 학습하지 않는다. 어댑터를 저장하거나 배포하지 않는다.

## 이미 수행한 검증

물리 GPU 1(TITAN RTX), Torch 2.10.0+cu128에서 실제 GPU 계산으로 확인했다. 작은 텐서는 Q=`1×24×64×256`, K/V=`1×4×64×256` FP16이다.

- 직접 GQA + 효율 커널은 `No available kernel`로 실패했다.
- KV 반복 + 효율 커널은 출력 및 Q/K/V gradient를 math 기준과 비교해 통과했다.
- 실제 등록 함수의 causal, bool 마스크, float 마스크, noncausal 네 조건에서 출력·역전파가 허용 오차 `atol=0.015, rtol=0.02` 안에 있었다.
- 미래 위치의 V를 바꿔도 앞쪽 causal 출력은 정확히 동일했다.
- 비교에서 최대 절대 오차는 출력 0.001953125, Q gradient 0.001953125, K gradient 0.00390625, V gradient 0.0078125였다. FP16 경로를 비교한 결과이며 bitwise 동일성을 주장하지 않는다.
- Python 문법, shell 문법 및 업로드 파일 SHA-256 검증을 완료했다.

이 작은 검증은 전체 모델의 역전파 성공·메모리 절약량·분석 품질 개선을 입증하지 않는다. 실제 3,557토큰 시험으로 따로 확인해야 한다.

## 실행과 복구

서버 작업 경로: `/home/duream/.local/share/oneuldo/qlora-memory-v2`.

`run-memory-controlled.sh`는 이전 결과 덮어쓰기를 거부한다. 기존 AI 연결과 GPU 1 점유를 확인한 후 게이트웨이와 Ollama를 잠시 멈춘다. 비교 프로세스를 최대 20분으로 제한하고 종료 시 서비스를 시작한 뒤 health를 확인한다. 서비스 정지·복구 시간은 이 20분에 추가된다. 예상한 CUDA OOM일 때만 두 번째 설정으로 진행하고, 그 외 오류는 중단한다.

GPU 1 UUID로 CUDA 가시성을 고정한다. GPU 0, 기존 운영 가중치, 집 노트북, 방화벽은 변경하지 않는다. 기존 체크포인트 캐시와 입력을 재사용하되, 결과는 `attempt-03-cleanup`과 `attempt-04-efficient`에 구분한다.

## 전체 27B 모델 실제 결과

| 설정 / 스텝 | 결과 | 스텝 시간 | 최대 Torch 할당 | 최대 Torch 예약 |
|---|---|---:|---:|---:|
| 메모리 정리 / T54 2,044토큰 | 갱신 성공 | 13.57초 | 20.14GiB | 21.34GiB |
| 메모리 정리 / T18 3,557토큰 | forward OOM | 완료 못함 | 성공 수치 없음 | 성공 수치 없음 |
| 효율 attention / T54 2,044토큰 | 갱신 성공 | 12.53초 | 20.11GiB | 21.07GiB |
| 효율 attention / T18 3,557토큰 | 갱신 성공 | 23.69초 | 22.63GiB | 23.20GiB |
| 효율 attention / T18 반복 | 갱신 성공 | 23.03초 | 22.63GiB | 23.20GiB |

메모리 정리 설정은 290MiB를 추가 할당하려다 실패했다. 그때 여유 메모리는 207MiB였다. 효율 attention 설정은 세 스텝 모두 유한 loss·유한 비영 gradient norm 및 표본 LoRA B 가중치 변화를 확인했다. 커스텀 효율 attention 호출은 96회였고 실제 입력 길이 2,044/3,557이 기록됐다. 조용히 다른 attention 경로로 돌아간 시험이 아니다.

긴 예제의 두 loss는 1.102975와 1.093421이었다. 같은 예제를 반복 학습한 결과이며 일반화나 분석 품질 개선의 증거로 해석하지 않는다. 첫 T54의 math/효율 경로 loss는 1.214685/1.214441로 작은 차이가 있었다. 부동소수점 커널 변경에 따른 수치 차이가 있으므로 계산 결과가 완전히 동일하다고 주장하지 않는다.

체크포인트 로드·준비를 포함한 프로세스 실행 시간은 각각 63.84초와 96.20초였다. 두 비교 실행기의 벽시계 시간 합은 별도 `controller-result.json`에 남겼다. 입력과 정답을 자르지 않았고 rank나 학습 모듈 범위를 줄이지 않았다. 어댑터는 저장하지 않았다.

### 남은 메모리 한계

긴 예제 종료 직후 `nvidia-smi`는 GPU 1 사용 23,975MiB·여유 49MiB를 기록했다. 이 사용량에는 PyTorch 예약 메모리가 포함되므로 전부 활성 텐서는 아니지만, 메모리 여유가 작은 것은 분명하다. **현재 조건에서 긴 예제 두 번이 성공했다는 범위까지만 검증됐다.** 4,096토큰, 전체 60개, 변경된 예제, 장시간 학습 또는 동시 추론은 검증하지 않았다. 본학습 전 손실 계산 등의 최대 메모리를 더 줄이고 전체 예제 길이/정답 길이 조건을 재점검해야 한다.

linear attention은 설치 환경에 최적화 패키지가 없어 Transformers 기준 구현을 사용했다. 이것이 속도 제약일 수 있으나 이번에는 패키지를 추가하거나 계산 경로를 바꾸지 않았다.

## 서비스 복구 확인

- 복구 래퍼 결과: `RESTORED`, 시험 종료 코드 0.
- Ollama·Spring 게이트웨이·HTTPS 서비스 모두 active.
- SSH 경유 health, 인증 tags, 인증 chat 모두 HTTP 200. 모델 응답은 `연결 성공`, 전체 API 대기 20.67초(모델 재로드 포함).
- 공개 HTTPS health는 HTTP 200, 약 0.30초. 이것만으로 기존 연결 불안정이 해결됐다고 보지는 않는다.
- 기존 운영 모델 digest `3a40c32f1450`, context 8192, 100% GPU로 다시 로드됐다. 최종 GPU 1은 17,203MiB, GPU 0은 64MiB였다. 시험 프로세스는 남아 있지 않았다.
- 시험 중 GPU 0 사용량도 잠시 증가한 표본이 있었다. 그 프로세스 원인은 이 시험에서 확인하지 못했다. 우리 시험은 GPU 1 UUID만 노출한 설정으로 실행했고 GPU 0 설정/서비스에 명령을 내리지 않았다. GPU 0 사용량이 시험 내내 일정했다고 주장하지 않는다.
- 이 검증을 위해 만든 로컬 11881 포워딩만 종료했다. 사용자의 공유 SSH 연결은 유지했다.

## 다음 작업

1. 메모리 여유를 추가 확보한 뒤 전체 학습 후보의 길이·정답 길이 조건을 점검한다.
2. 60개 안에서 과제 품목 수 편향과 AI의 잘못된 해석을 정정하는 사례를 보완한다. 동결된 native-v2 파일은 이번 작업에서 변경하지 않았다.
3. 동일 원본·양자화·추론 조건을 갖춘 미튜닝/튜닝 비교를 준비한 후 본학습과 평가를 진행한다. 현 GGUF와 학습 원본의 정확한 리비전 동일성 미확인 문제는 여전히 남아 있다.

## 이번 실행 증거

- [메모리 정리 설정 결과](results/attempt-03-cleanup/smoke-result.json), [OOM traceback](results/attempt-03-cleanup/smoke-traceback.txt)
- [효율 attention 세 스텝 결과](results/attempt-04-efficient/smoke-result.json), [단계별 메모리 로그](results/attempt-04-efficient/smoke-events.jsonl)
- [비교 실행기 결과](results/controller-result.json), [복구 메시지](results/restoration.txt)
- [인증 API 검증](results/service-restoration.json), [공개 health](results/public-health-after.json), [최종 GPU/서비스 상태](results/restored-hardware.json)


## 근거와 파일

- [커널 비교 결과](attention-check.json), [실제 함수·마스크 검증 결과](backend-check.json)
- [학습 시험 코드](smoke_qlora.py), [attention 함수](efficient_attention.py), [수치 검사](test_backend.py)
- [비교 실행기](run_probes.py), [서비스 제어·복구](run-memory-controlled.sh), [업로드 해시](SHA256SUMS)
- [이전 1·2차 실패/성공 범위](../training-preflight-v1/README.ko.md)
- [PyTorch 2.10 SDPA 문서](https://docs.pytorch.org/docs/2.10/generated/torch.nn.functional.scaled_dot_product_attention.html): GQA의 KV 반복 의미, 당시 지원 커널 및 math FP32 중간 계산. 최신 PyTorch 문서와 버전별 지원 범위를 혼동하지 않는다.
- [Transformers attention 등록 문서](https://huggingface.co/docs/transformers/main/attention_interface): attention 함수와 마스크 생성기 등록.
