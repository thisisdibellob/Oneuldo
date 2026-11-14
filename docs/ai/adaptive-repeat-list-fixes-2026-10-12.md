# 추천 반복·목표 목록 수정 후 실제5회 재검사

민재v2의 새 계정·빈 기억으로 기초1→추천1→추천2→추천3→동일 기초2를 실제 UI 입력으로 진행했다. 학교 AI 분석과 프로필은5회 모두 READY까지 확인했다. 기존 원본 재분석, 실패한 생성·재시도·로그인·준비 대기는 새 플레이로 세지 않았다.

## 실제 결과

|회차|정확히 담은 목표 종류|AI 판정|장보기 시간 / 제한|총액 / 예산|
|---|---:|---|---:|---:|
|기초1|2/4|FAILURE|7분 43초 / 600초|15,600원 / 26,000원|
|추천1|3/3|SUCCESS|9분 32초 / 600초|14,000원 / 14,000원|
|추천2|3/3|SUCCESS|7분 0초 / 600초|9,600원 / 13,600원|
|추천3|3/3|SUCCESS|6분 55초 / 600초|8,600원 / 10,400원|
|기초2|4/4|FAILURE|10분 0초 / 600초|23,000원 / 26,000원|

첫 기초에서는 작은 우유200mL와 낱개 바나나를 담아 정확한 목표가2/4종이었다. 마지막 동일 기초에서는900mL 우유와1송이 바나나를 포함해4/4종이 정확했지만600.005초에 시간 초과로 종료돼 최종 구매 제출은0회다. 종료 시점의 장바구니 스냅샷이며 구매 성공으로 세지 않는다. 같은 조건의 선택 정확도는 달라졌지만 완료·전이·숙달은 확정하지 않는다.

앱의 실제 경과 시간에는 관찰 저장·CLI·브라우저 입력 도구의 지연이 포함된다. 사람의 인지 속도나 시간 효율의 증거로 해석하지 않는다. 성패는 강제하지 않았다.

## 이전5회와의 비교

|항목|이전실험|이번실험|
|---|---|---|
|첫 기초|3/4종·실패|2/4종·실패|
|추천3회|같은 우유/바나나2품목,세번모두성공|서로다른3품목조합,세번모두성공|
|마지막 기초|4/4종·시간내구매제출·성공|4/4종담음·시간초과·미제출|

추천 다양성과 목록 접근은 실제로 개선됐지만 구매 완료 성적이 이전보다 좋아졌다는 결과는 아니다. 이전 실험도 마지막 기초4/4종을 시간 내 제출했다. 이번의 첫/마지막 선택 변화만으로 코드 효과를 주장하지 않는다. 첫 회차 오답,추천품목수,추가규격안내,배우의입력경계/원본저장적용이 달라서 수행 시간을 코드만으로 비교할 수 없다.

## 추천 반복과 실제 변경

이전 실제 추천3회는 우유2개·바나나2송이 및 안내/조건이 같았다. 이번 실제 추천은 우유2개·바나나2송이·생수3개 → 우유2개·순한카레4인분1개·생수3개 → 우유2개·1인분순한카레1개·생수3개로 바뀌었다. 예산은14,000→13,600→10,400원이다. 세 번째에는4인분/1인분을 구분하라는 안내도 추가됐다.

현재 추천3개 모두 난이도2·3품목·600초다. 같은 기본SKU 두 개를 유지하며 한 개를 바꾸는 연습이고, 마지막에는 비교 힌트가 있다. 연속 성공만으로 숙달이나 도움이 필요 없다는 결론을 낼 수 없다. 품절·영수증 오류·직원 수 변화는 이5회에서 선택되지 않아 해당 분기 전체를 검증한 실험도 아니다.

## 목록과 배치 화면

HUD의 고정 전체 목록 버튼, 가로 목록 넘김/스크롤 표시, 규격·포장 단위·수량을 줄임 없이 보여 주는 전체 목록 창을 적용했다. 기본HUD에서 모든 긴 문구가 동시에 표시되는 방식은 아니며, 전체 목록 창에서 모두 확인할 수 있다. 목록 표시 동안 이동을 잠그고 장보기 시간은 계속 흐른다. 열기/닫기를 중립 문맥 사건으로 기록한다.

### 기초1

목표: {"milk": 2, "banana": 2, "instant-rice": 2, "water": 3}. 배치: ['drink', 'meal', 'household', 'fresh', 'produce'].

![기초1 실제 플레이](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/baseline-pre/01-whole-store.png)

[실제 전체 목록 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/baseline-pre/05-opened-list.png)

### 추천1

목표: {"milk": 2, "banana": 2, "water": 3}. 배치: ['fresh', 'produce', 'drink', 'meal', 'household'].

![추천1 실제 플레이](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/recommendation-1/playing.png)

[실제 전체 목록 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/recommendation-1/09-full-list.png)

### 추천2

목표: {"water": 3, "milk": 2, "curry": 1}. 배치: ['fresh', 'produce', 'drink', 'meal', 'household'].

![추천2 실제 플레이](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/recommendation-2/playing.png)

[실제 전체 목록 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/recommendation-2/07-full-list.png)

### 추천3

목표: {"water": 3, "milk": 2, "curry-one-mild": 1}. 배치: ['fresh', 'produce', 'drink', 'meal', 'household'].

![추천3 실제 플레이](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/recommendation-3/playing.png)

[실제 전체 목록 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/recommendation-3/08-full-list.png)

### 기초2

목표: {"milk": 2, "banana": 2, "instant-rice": 2, "water": 3}. 배치: ['drink', 'meal', 'household', 'fresh', 'produce'].

![기초2 실제 플레이](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/baseline-post/playing.png)

[실제 전체 목록 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/baseline-post/11-full-list.png)

[실제 시간 초과·분석 접수 화면](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/actor/baseline-post/analysis-accepted.png)

기초의 분류 순서는 drink/meal/household/fresh/produce, 추천은 fresh/produce/drink/meal/household다. 추천1에서 각 고정 매대 슬롯에 배정된 상품 분류 위치가 바뀌었다. 물리적인 매대 구조는 classic을 유지했고 추천2·3에서도 그 배치를 유지했다. 새 매대 구조나 이동 효율 개선을 실증했다고 부르지 않는다.

## 코드 및 토큰 검사

직전 실제 구매 조건을 비교하고 목표 순서·제목·설명·패널티만 바꾼 동일 과제를 차단한다. 지원 의미가 실제로 달라졌는지는 독립 검토하고 프로필의 다음 관찰이 구현되지 않았으면 수정한다. 프로필의 EXPLORE_CATEGORY_VARIETY 계획에는 직전 목표에 없는 범주를 요구한다. 고정 예시 상품/환경값을 선택 범위와 자료형으로 바꿔 복사를 줄였다. 동일 조건의 의미 있는 지원 연습은 허용하고 성공 후 난이도를 자동 상승시키지 않는다.

이전 반복3개 원문을 사용한 회귀 검사에서 후속 두 동일 후보를 차단했다. 관련 백엔드74개+프런트42개 검사, TypeScript·빌드 통과. 실패·오류·건너뜀0.

첫488개 사건/349개 위치의 관찰 입력이27,216토큰으로 실패해 v63에서 위치 원본을2요청으로 균형 분할했다. 모든 위치 행·좌표·시각·순서와 전체 행동/지형 맥락을 보존한다. 다음3회 이력의 생성이24,477토큰으로 실패해 v64에서 현재 환경의 중복값을 원본/이력과 무손실 공유했다. 같은 실제 입력의 회귀 생성은22,985토큰, 실제 성공한 생성은23,154토큰이다. 최종까지 실제 추천 요청13개가 모두24,000안에 들어왔고 생성/검토 원문의 재복원도 통과했다. 생성 정책은420초/최대6호출이며 플레이600초 및 요청24K와 별개다.

추천3의 첫 분석은 compact finding의7칸 중 skill 또는 빈 대안 배열을 빠뜨려325.926초 뒤 INVALID_AI_ANALYSIS로 실패했다. synthesis-v15는7필드의 순서·자료형과 재시도 시 기대·실제 칸 수를 명확히 안내한다. 잘못된 원문을 임의로 보충하지 않고 차단했고, 같은 원본을 새 코드로 재분석했다. 기존 실패와 실제 재분석은 모두 보존한다. 생성 v64는 유지하고 분석출력 계약만 보완했다.

## 남아 있는 중요한 분석 품질 문제

1. 과거 사건의 관찰과 미래 과제 계획을 한 필드에 섞거나 제출한 오답SKU를 원래 목표처럼 설명한다. 추천1에는 존재하지 않는 인라인 사건ID도 검토 후 남았다. 원본 검수 통과가 설명의 근거 정확성까지 보장하지 않았다.
2. 한 번의 성공을 규격 식별 능력이 충분하다고 확정하거나 시선/오류 수정 의지를 로그로 관찰하려 한다. 현재 로그에는 눈추적·의도 측정이 없다. 행동 사실, 미확인 원인, 향후 관찰 질문을 더 엄격히 구분해야 한다.
3. 추천3의 검토는 지원 변화를UNCHANGED로 표시했지만 실제로4인분/1인분 비교 힌트가 추가됐다. SKU 변경은 실현됐으나 지원 감소·증가의 의미 검토는 개선이 필요하다. 마지막 계획의600초 제한 연장도 현 정책 상한600초와 맞지 않는다. 생성 계약의 상한 검증과 다음 계획 설명의 실행 가능성을 함께 대조해야 한다.

동작 수정과 실제 완료 결과는 확인했다. 위 설명 문제, 숙달/전이 또는 일반 사용자에게서의 효과까지 해결됐다고 보고하지 않는다.

## 실험 경계와 원본

첫 기초는v62,추천1/2는v63,추천3 생성은v64이며 추천3 원본 재분석과 마지막 기초는synthesis-v15를 사용했다. 전송/출력 형식의 기술 보완을 중간에 적용했으며 UI는 첫 회차부터 같다. 변경 사유와 각 버전 해시/JAR을 따로 보존한다. 하나의 합성 성인 페르소나·하나의 연속5회 실험이다. 원본 provenance.source=human은 직접 브라우저 입력의 구현 라벨이며 실제 사람 연구로 재분류하지 않는다. 배우에게 운영자 판정·정답을 전달하지 않았다. 첫회차 CLI retrieve/decision은2개 화면에서만 적용됐고 뒤 회차는 행동 전 화면마다 적용했다. 준비 배우가 다른 에이전트 요약을 읽은 문맥은 실제 플레이0회 상태에서 버렸다.

추천3의 미사용 진단current20/21을 보존했다. 마지막 기초current26은 이미 종료 모달인데 이전 매장 배경의 계산대 이름으로 전사했고, 그 전사를 실제 CLI decision 및 키 입력 시도에 사용했다. 종료 후 접근 완료를 뜻하지 않는다. 원본·선택·입력을 보존하고 후속 의미 대조 및 기억 부호화에서만 제외했다. 사후 제외를 사전 예방으로 설명하지 않으며 종료 스냅샷을 구매·제출로 꾸미지 않는다. 추천1/2의 수동 남은 시간 전사13개는 대응AX와 다르며 별도 supplement에 원본을 보존했다. 파일 해시/CLI 확인은 수동 의미 전사 전체의 정확성을 보장하지 않는다. 시간 판정은 앱 원본timing을 사용한다. 즉시 재검사와 상품 친숙화가 섞이므로 성적 변화를 코드만의 효과나 지속 학습으로 단정하지 않는다.

[실제 결과 원문](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/auditor/result-summary.json) · [이전/현재 조건 대조](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/auditor/previous-current-comparison.json) · [기초 조건 비교](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/auditor/baseline-pre-post-condition-comparison.json) · [상세 품질 감사](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/auditor/quality-notes.md) · [실제 요청 토큰 감사](/Users/bluem/Documents/GitHub/Oneuldo/output/adaptive-five-fixes-20261012/auditor/actual-current-generation-token-audit.json)

## 변경한 코드

[추천 진행 검증](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/personalization/service/AdaptiveQuestProgression.java) · [전체 목록 HUD](/Users/bluem/Documents/GitHub/Oneuldo/frontend/src/components/game/MarketHud.tsx) · [무손실 전송](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/personalization/service/AdaptiveQuestTransport.java) · [최종 출력 계약](/Users/bluem/Documents/GitHub/Oneuldo/backend/src/main/java/oneuldo/behaviorlog/analysis/service/AnalysisSynthesisPrompt.java)

## 기록 보관

로컬 원본을 보존하며 지정 학교 외장하드에 최종 complete 보관을 실행한다. UUID/마운트·복사 후 SHA-256 검증 결과는 보관 완료 후 확인서로 붙인다.

## 최종 외장하드 보관 확인

완료된5회 묶음을 `complete` 상태로 지정 외장하드에 보관했다. `/dev/sda1`, `/mnt/wd_hdd`, UUID `B4E0414DE04116D0` 검증과 원격 파일969개의 SHA-256 대조를 통과했다. 인증·개인 설정·실행 파일23개는 제외했고 로컬 원본은 유지했다. 보관 상태는 장보기 성패와 별개다.

원격 경로: `/mnt/wd_hdd/oneuldo/tests/adaptive-five-fixes-20261012/9bc1a75ecdbd011f331cc2c953132a083a7c72c6d666d1652e5e3eb1eaba94f9`

[최종 보관 확인서](/Users/bluem/Documents/GitHub/Oneuldo/output/.test-archives/adaptive-five-fixes-20261012/9bc1a75ecdbd011f331cc2c953132a083a7c72c6d666d1652e5e3eb1eaba94f9.receipt.json)

이 문단은 원격 검증 후 추가한 확인이다. 외장하드 스냅샷의 REPORT.md와 manifest는 덮어쓰지 않았다.
