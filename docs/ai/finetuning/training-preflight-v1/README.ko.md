# GPU 1 QLoRA 소규모 학습 시험 — 2026-09-24

**물리 GPU 1(TITAN RTX 24GB)에서 2,044토큰 학습 예제 1개의 역전파와 LoRA 갱신은 성공했다. 이어 실행한 3,557토큰 예제는 메모리 부족으로 실패했다. 현재 시험 설정으로 학습 후보 60개 전체가 가능하다고 확인한 것은 아니다.** 본학습과 운영 배포는 실행하지 않았다.

## 모델과 환경

- 공식 원본: `Qwen/Qwen3.6-27B`, 리비전 `6a9e13bd6fc8f0983b9b99948120bc37f49c13e9`.
- 15개 원본 가중치 파일, 총 55,563,006,400바이트(약 55.56GB)를 서버의 사용자 전용 캐시에 내려받았다. 설정·대화 템플릿·토크나이저·라이선스 해시를 기존 고정 메타데이터와 대조했다.
- 원본을 bitsandbytes NF4 이중 양자화로 메모리에 로드했다. 기존 Ollama Q4_K_M 파일을 직접 학습한 것이 아니다.
- `CUDA_VISIBLE_DEVICES`를 GPU 1의 UUID `GPU-215716d9-f53e-fc5f-566e-f54fcbc700b1`로 고정했다. 프로세스에는 GPU가 하나만 보이므로 CUDA 오류의 `GPU 0`은 **물리 GPU 1**이다.
- Ubuntu 20.04, Torch 2.10.0+cu128, Transformers 5.17.0, PEFT 0.21.0, bitsandbytes 0.50.2. 별도 venv가 기존 환경의 Torch를 읽으며 새 라이브러리는 venv 안에 설치했다. 시스템 Python/Java는 변경하지 않았다.
- 전체 학습 후보 파일 해시: `3059b0d36d77e5f1304ac6ccbc5ba5fb5ab910cfcca4f68f876692b33c9669a3`.
- 현재 서비스의 GGUF와 이 원본 체크포인트의 **가중치가 정확히 같은 리비전인지 확인되지 않았다.** 어댑터를 기존 GGUF에 바로 적용할 수 있다고 보장하지 않는다.

공식 참고: [고정 리비전 모델](https://huggingface.co/Qwen/Qwen3.6-27B/tree/6a9e13bd6fc8f0983b9b99948120bc37f49c13e9), [Qwen3.5/3.6 구현 문서](https://huggingface.co/docs/transformers/main/model_doc/qwen3_5), [PEFT 양자화 학습](https://huggingface.co/docs/peft/developer_guides/quantization), [bitsandbytes 설치·하드웨어](https://huggingface.co/docs/bitsandbytes/main/en/installation). `README.md`는 내려받은 공식 모델 카드이며 이 시험 보고서와 별개다.

## 시험 조건

- batch 1, LoRA rank 8/alpha 16/dropout 0, 학습률 1e-5, FP16 계산, AdamW, gradient checkpointing(non-reentrant).
- 언어 레이어의 attention/linear-attention/MLP 투영에만 LoRA를 붙였다. 학습 가능 파라미터는 58,363,904개. 원본 가중치와 비전 모듈은 고정했다.
- 학습 자료에서 가장 긴 프로필 T54(2,044토큰)와 가장 긴 세션 T18(3,557토큰)을 선택했다. 평가 25개는 학습에 사용하지 않았다.
- 전체 system/user/assistant 문장을 자르지 않았다. prompt 부분을 손실에서 제외하고 assistant와 종료 토큰에만 causal loss를 계산했다. ignored prompt 위치의 거대한 vocabulary logits는 생성하지 않는다.
- 설정 상한은 4096이지만 실제 4096토큰 예제를 실행한 것은 아니다. 측정한 길이와 상한을 혼동하지 않는다.
- 외부 요청 연결과 GPU 점유가 없을 때 게이트웨이·Ollama를 잠시 정지했다. 종료·오류·30분 제한 후 서비스를 다시 시작하도록 구성했다. Caddy·방화벽·GPU 선택 설정·집 노트북은 변경하지 않았다.

## 실제 결과

| 실행 | 결과 | 근거 |
|---|---|---|
| 1차 | 학습 준비 중 OOM, 학습 스텝 0개 | PEFT 준비 함수가 큰 고정 행렬을 FP32로 변환하며 4.74GiB 추가 할당 시도 |
| 2차 T54 | forward/backward/optimizer 갱신 성공 | 유한 loss 1.214685, 유한 gradient norm 0.949495, 표본 LoRA B 가중치 변화 확인 |
| 2차 T18 | forward의 SDPA attention에서 OOM | 290MiB 추가 할당 실패, 그 시점 GPU 여유 약 11MiB |

1차 43.46초, 2차 전체 62.96초였다. 두 번째 실행에서 원본 로드·학습 준비 후 Torch 할당은 약 16.92GiB였고, T54 학습 스텝은 **13.77초** 걸렸다. T54의 최대 Torch 할당은 **20.16GiB**, 최대 예약은 **22.41GiB**였다. `nvidia-smi`는 당시 약 22.63GiB를 사용한 것으로 보였다. Torch 할당/예약과 드라이버 메모리는 서로 다른 수치다.

2차에서는 PEFT 함수가 큰 고정 임베딩·출력 행렬을 먼저 FP32로 만들지 않도록 했다. 두 행렬은 처음부터 FP16으로 유지하고, 고정 가중치 freeze·나머지 비양자화 파라미터의 FP32 변환·체크포인팅은 명시적으로 적용했다. 이 변경으로 준비 단계 OOM은 해소됐으나 긴 예제의 학습 가능성까지 확보하지는 못했다.

**loss 한 번과 가중치 변화는 학습 코드가 작동했다는 확인일 뿐, 분석 품질이 좋아졌다는 증거가 아니다.** 2번째 예제 전에 첫 스텝의 optimizer 상태가 만들어져 있으므로 빈 optimizer에서의 단일 forward보다 메모리 조건도 무겁다.

## 결과 해석의 한계와 다음 시험

- 이번 실패는 이 구체적인 구현·하이퍼파라미터·실행 순서의 결과다. TITAN RTX 24GB에서 27B QLoRA가 모든 방법으로 불가능하다는 결론은 아니다.
- 실행 후 점검에서 스텝 사이에 `grads` 리스트가 이전 gradient Tensor를 붙잡을 수 있음을 확인했다. 최신 로컬 `smoke_qlora.py`에는 스텝 종료 시 참조·gradient·allocator cache를 정리하고 expandable segments를 쓰도록 수정했다. **이 후속 수정은 문법 검사만 했고 서버에서 재시험하지 않았다.** 따라서 메모리 절감 효과를 결과에 포함하지 않았다. 실제 실행한 2차 코드는 `results/attempt-02/smoke_qlora.py`에 보존했다.
- 다음 순서는 이 정리 수정의 재시험, Turing에서 사용할 수 있는 메모리 효율 attention/체크포인팅 확인, 필요 시 학습 대상 모듈 축소나 CPU offload 검토다. 각각 속도와 학습 효과를 다시 측정해야 한다.
- 긴 예제를 임의로 자르면 정답과 근거를 잃을 수 있다. 자르지 않고 들어가게 만드는 것을 우선하고, 불가능할 때 입력 재설계 또는 더 큰 VRAM을 검토한다.
- 전체 60개를 학습하기 전 데이터 계획 분포를 보완하고, 비교할 원본/튜닝 모델을 같은 체크포인트·양자화·추론 설정으로 맞춰야 한다. 현 Ollama GGUF 기준과 HF NF4 결과 차이를 모두 LoRA 효과로 취급하면 안 된다.

## 서비스 복구

두 시험 후 Ollama·Spring 게이트웨이·HTTPS 서비스 모두 active를 확인했다. SSH 경유 `/healthz`·인증 `/api/tags`·기존 모델 `/api/chat` 모두 HTTP 200이며 응답은 `연결 성공`이었다. 마지막 공개 HTTPS `/healthz`도 HTTP 200(약 0.29초)이었다. 초기 공개 연결 시간 초과가 있었으므로 한 번의 성공으로 네트워크 불안정이 해결됐다고 보지는 않는다.

기존 모델은 다시 물리 GPU 1에 올라갔다. GPU 0은 디스플레이 수준의 약 64MiB였으며 학습 프로세스는 남아 있지 않다. 성공한 1스텝 변경은 메모리에만 있었고, 2스텝 완료 후 저장하도록 한 코드가 실패 종료되어 어댑터를 저장·배포하지 않았다. 서버 디스크는 약 59.8GiB가 남았다.

## 증거 파일

- [1차 원문 결과](results/attempt-01/smoke-result.json), [1차 traceback](results/attempt-01/smoke-traceback.txt)
- [2차 원문 결과](results/attempt-02/smoke-result.json), [2차 단계별 로그](results/attempt-02/smoke-events.jsonl), [2차 traceback](results/attempt-02/smoke-traceback.txt)
- [서비스 응답](results/service-restoration.json), [최종 공개 health 확인](results/public-health-after.json), [복구 후 GPU·서비스·가중치 파일 정보](results/restored-hardware.json)
- [설치 패키지](results/packages.json), [실행 래퍼](run-smoke-controlled.sh)
