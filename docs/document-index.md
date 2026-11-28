# 오늘도 게임 문서 안내

정리일: **2026-10-17**. 우리가 작성한 프론트엔드·게임·조사·제작 문서를 용도별로 연결한 목차다. 기존 파일 경로와 과거 기록은 유지했다. 로컬 작업 트리를 기준으로 작성했으므로 새 문서의 존재가 원격 저장소 반영을 뜻하지는 않는다.

## 필요한 일부터 고르기

| 하려는 일 | 먼저 읽을 문서 | 이어서 볼 것 |
| --- | --- | --- |
| 다른 PC에서 개발 이어가기 | [개발 인수인계](handoff/README.md), [프론트엔드 작업 규칙](../frontend/AGENTS.md) | [실행·앱 연결 상태](handoff/project-state-2026-10-13.md), 해당 기능 문서 |
| 게임별 규칙·수정 위치 찾기 | [프론트엔드 기능 문서](../frontend/docs/README.md) | 아래 게임별 바로가기 |
| 보고서·주간 활동 일지 작성 | [활동 일지 작성 기준](handoff/weekly-log-guide.md) | [날짜·커밋 근거](handoff/activity-evidence-2026-10-13.md), [로컬 보고서·스크린샷](handoff/local-artifacts.md) |
| 발달장애·지원 근거 읽기 | [조사 자료 안내](handoff/research/README.md) | [10월 17일 추가 조사](handoff/research/behavior-support-2026-10-17/README.md) |
| AI 분석·실행기 연결 범위 확인 | [장보기 실행 인터페이스](../frontend/docs/market-agent-contract.md) | [배치 JSON의 추가 계약](../frontend/docs/market-tilemap-editor.md), [AI 근거 활용](handoff/research/baseline-2026-09-04/02_AI_근거자료_활용과_검증.md) |
| 이미지 출처·이전 디자인 찾기 | [아트 제작 기록 안내](design-concepts/README.md) | 캐릭터·마트·도서관·버스 원본과 제작 기록 |

**문서의 역할:** 기능 참조는 수정 위치와 규칙을 찾는 안내, 기획은 당시 제안, 구현·검증 이력은 그 시점의 결과, 조사는 설계 근거다. 날짜가 붙은 문서의 ‘현재’는 해당 문서 작성 당시를 뜻한다. 실제 동작은 최신 사용자 결정과 해당 코드에서 확인한다.

## 1. 게임별 바로가기

| 영역 | 우선 참고 | 상세 자료·이력 |
| --- | --- | --- |
| 마을·퀘스트·공통 조작·휴대폰·앨범 | [마을·장보기·공통 인수인계](handoff/world-market-shared-2026-10-13.md) | 조작·카메라·스프라이트·음악·저장 경계와 파일 지도 |
| 장보기 | 위 공통 인수인계의 장보기 절 | [실행·기록 계약](../frontend/docs/market-agent-contract.md), [품절·선택 구매·키오스크](market-v8-shopping-learning-kiosk.md), [계산 내역 정정](market-checkout-review-2026-09-24.md) |
| 마트 배치 편집 | [그리드 배치·JSON](../frontend/docs/market-tilemap-editor.md) | [배치 JSON 예제](../frontend/docs/examples/market-tilemap-layout.json), [세션 JSON 예제](../frontend/docs/examples/market-tilemap-session.json), [기존 모퉁이 배치 설정](../frontend/docs/examples/market-corner-construction.json) |
| 도서관 | [도서관·버스 인수인계](handoff/library-bus-2026-10-13.md) | [업무·손님·실내 변경 기록](library-game-v1.md), [실제 분류 조사](library-classification-research.md), [초기 기획](handoff/research/supported-work-2026-09-29/02_도서관_근무_게임_기획안.md) |
| 버스 | [도서관·버스 인수인계](handoff/library-bus-2026-10-13.md) | [시나리오와 후속 기록](bus-to-library-scenario-v1.md), [한국·일본 버스 구조 조사](bus-reference-research.md), [아트 제작 이력](../frontend/docs/bus-art-prompts.md) |
| 카페 | [카페 첫 근무](../frontend/docs/cafe-shift.md) | 주문·제조·전달·정리·보고, 이미지 비율, 상태·저장 경계 |
| 빨래방 | [빨래하는 날](../frontend/docs/laundry-day.md) | 분류·세탁·건조·정리, API 계약, 완료 기록. 전체 화면 통합 검증 기록은 미완 |
| 보이스피싱 대응 | [수상한 연락 확인하기](../frontend/docs/phishing-safety-game.md) | 정상/사칭 연락, 확인·도움 요청·피해 대처, 휴대폰과 마을 진입 |
| 요리·계산 알바 | [공통 인수인계 4장](handoff/world-market-shared-2026-10-13.md) | 별도 최신 전용 안내 대신 해당 장과 연결된 소스에서 확인 |
| 보상(XP·레벨·뱃지) | [보상 체계 설계안](reward-system-design.md) | 2026-11-27 제안. 팀 합의 전이며 아직 구현하지 않음 |

10월 13일 종합 인수인계에 10월 17일 새 기능이 모두 들어 있는 것은 아니다. 배치 편집·카페·빨래방·수상한 연락은 위 개별 문서를 함께 읽는다. 마트 JSON 편집 기능과 실제 백엔드 연결 완료도 별개다.

## 2. 조사 자료

전체 목록·대조 범위·로컬 원문 위치는 [조사 자료 안내](handoff/research/README.md)에 모았다. 날짜별 묶음은 합치거나 덮어쓰지 않는다.

| 묶음 | 읽을 문서 | 역할 |
| --- | --- | --- |
| 2026-09-04 기본 조사 | [AI 활용과 검증](handoff/research/baseline-2026-09-04/02_AI_근거자료_활용과_검증.md), [151개 출처](handoff/research/baseline-2026-09-04/03_출처_찾아보기.md), [장보기 적용](handoff/research/baseline-2026-09-04/06_확장자료_핵심과_시나리오_적용.md) | 최초 근거 자료와 지원 설계 |
| 2026-09-16 전문가 역할 AI | [신규 18개 검토](handoff/research/expert-ai-2026-09-16/02_신규자료_검토.md), [적용 가이드](handoff/research/expert-ai-2026-09-16/03_전문가AI_적용가이드.md) | 관찰·해석·확인 질문의 구분 |
| 2026-09-19 개인차 | [심층조사](handoff/research/individual-differences-2026-09-19/지적장애의_개인차와_생활지원_심층조사.md), [출처 대조표](handoff/research/individual-differences-2026-09-19/기존자료와_신규자료_출처대조표.md) | 신규 21·재검토 8, 영역별 개인차 |
| 2026-09-29 공공·지원 일자리 | [일자리 조사](handoff/research/supported-work-2026-09-29/01_공공지원_일자리_조사.md), [도서관 최초 기획](handoff/research/supported-work-2026-09-29/02_도서관_근무_게임_기획안.md) | 직업 게임 선정 배경. 현재 채용공고 목록이 아님 |
| 2026-10-17 행동·생활지원 | [묶음 안내와 7개 본문](handoff/research/behavior-support-2026-10-17/README.md), [31개 출처 JSON](handoff/research/behavior-support-2026-10-17/sources-all.json) | 신규 28·재검토 3, 관찰 사례 22개·설계 후보 12개 |
| 2026-09-18 학교 AI 기술 진단 | [비식별 보관본](handoff/research/school-ai-2026-09-18/학교_AI_서버_연결_및_분석_진단_보고서.md) | 합성 기록을 이용한 당시 연결·분석 시험. 장애 문헌이나 실사용자 평가와 구분 |

현재 핵심 출처 목록은 **218개 출처 항목**이다. 실제 참가자 218명, 정답이 붙은 학습 사례 218건, 전문 논문 218편을 뜻하지 않는다. [집계와 중복 기준](handoff/research/behavior-support-2026-10-17/06_기존자료와_신규자료_대조.md)을 함께 사용한다.

## 3. 구현 변경과 검증 이력

보고서에서 ‘무엇을 왜 바꿨는가’를 찾을 때 사용한다. 아래 v2–v8은 작업 단계 이름이며 현재 전체 게임의 단일 버전 번호가 아니다. 테스트 개수·화면 크기·에셋 수는 해당 시점 기록이다.

| 문서 | 담긴 변경 |
| --- | --- |
| [초기 환경 인수인계](market-environment-handoff.md) | 환경 변수·AI 어댑터·JSON 기록의 초기 설계. 상품 수·계산대 수 등은 당시 값 |
| [장보기 팀 보고 2026-09-11](market-team-report-2026-09-11.md) | 당시 팀 전달용 기능·환경 설정·후속 연결 범위 |
| [배치 v2](market-layout-v2.md) | 초기 매장 재배치, 경보·반환·생활용품 확장 |
| [공간 v3](market-layout-v3.md) | 통로·출입구·충돌·이동 계약 |
| [아트 v4](market-art-v4.md) | 마트 집기와 구매 화면 비주얼 개편 |
| [크기·화면 전환 보완](market-visual-refinement.md) | 진열대·캐릭터 배율과 UI 전환 |
| [진열·조작 v5](market-v5-assortment-layout-interaction.md) | 진열 구성·대화·두 번째 매장 |
| [팝업·공사 v6](market-v6-popup-construction-branch.md) | 장바구니·입구 공사·모퉁이 지점 |
| [직원 대화 v7](market-v7-staff-dialogue.md) | 직원·계산원 요청과 응답 분기 |
| [학습·키오스크 v8](market-v8-shopping-learning-kiosk.md) | 품절 대처·선택 구매·셀프 계산 |
| [HUD·충돌 2026-09-13](market-hud-collision-fixes-2026-09-13.md) | HUD·벽·출구 경보기 수정 |
| [로딩 2026-09-13](market-loading-optimization-2026-09-13.md) | 실행 이미지와 폰트·음악 로딩 정리 |
| [휴대폰·출입 2026-09-16](market-phone-entry-2026-09-16.md) | 휴대폰 UI·품절 확인·공사 출입 |
| [계산 확인 2026-09-24](market-checkout-review-2026-09-24.md) | 계산 내역·잘못된 수량 정정 요청 |
| [버스 검증 2026-09-29](bus-revision-validation-2026-09-29.md) | 내부 배치·마을 연결 수정 당시 검사 |
| [버스 재제작 2026-10-01](bus-revision-validation-2026-10-01.md) | 내부·외관·주행·좌석 재제작 당시 검사 |
| [Expo SDK 57 이전](../frontend/docs/expo-sdk-57-upgrade.md) | SDK 변경·API 호환·로그인·터널 실행 과정 |
| [노트북 인수인계 2026-09-11](handoff/notebook-handoff-2026-09-11.md) | 당시 이동 작업의 기록. 최신 기능 목록은 새 인수인계 우선 |

도서관 파일명 `library-game-v1.md`와 버스 `scenario-v1.md`에도 후속 수정 기록이 들어 있다. 파일명의 v1만 보고 첫 버전 내용으로 한정하지 않는다.

## 4. 아트·캐릭터·폰트

[아트 제작 기록 안내](design-concepts/README.md)에서 마트 제작 기록 9개와 에셋 폴더별 README를 연결한다. 생성 프롬프트·원본·런타임 그림·해시의 역할을 구분했다.

- 플레이어 원본은 [레퍼런스 보관 기록](../frontend/assets/images/game/characters/player/reference/README.md)에서 찾는다.
- 걷기·대기는 [사용자 동작 v3](../frontend/assets/images/game/characters/player/chibi-user-v3/README.md), 최신 달리기 출처는 [sprint2 provenance](../frontend/assets/images/game/characters/player/chibi-sprint2-v1/provenance.json)와 현재 코드 매핑에서 확인한다.
- [아트 바이블 v0.1](../frontend/docs/game-art-bible.md)은 초기 방향 제안이다. 모듈 캐릭터 규격·애니메이션 프레임·목적지 터치 이동 설명을 현재 플레이어와 공통 조작에 그대로 적용하지 않는다.
- [웹 폰트 기록](../frontend/assets/fonts/web/README.md)은 WOFF2 변환·보존·검증 자료다. 실제 적용 폰트는 [theme.ts](../frontend/src/theme.ts)와 로딩 매핑을 따른다.

## 5. 보고서·주간 일지·전달 파일

읽는 순서는 **[작성 규칙](handoff/weekly-log-guide.md) → [활동 근거](handoff/activity-evidence-2026-10-13.md) → 해당 기능 변경 기록 → [로컬 산출물](handoff/local-artifacts.md)**이다.

커밋일·문서 작성일·실제 작업일·확인일을 구분한다. 기획안, 합성 시험, 실제 화면 확인, 당사자 평가를 같은 완료 항목으로 합치지 않는다. 보고서용 스크린샷·PPTX·Word/PDF가 이 PC에만 있는 경우는 로컬 산출물 목록에 표시한다.

## 6. 팀 공통 문서와 관리 범위

다음은 연결할 때 참고하는 팀 문서이며 이번 프론트엔드 문서 정리에서 내용을 수정하지 않는다.

- [협업 규칙](collaboration.md)
- [데이터베이스 명세](database-schema.md), [DB 실행](database-setup.md)
- [퀘스트 데이터 파이프라인](quest-data-pipeline.md)
- [팀 소개](README.md): 소개문·이미지 자리표시 등은 팀 문서로 유지한다. 이 목차가 팀 전체의 제품 대상·운영 규정을 새로 정의하지 않는다.

새 기능의 계약·상태·저장 범위는 `frontend/docs/`, 여러 기능을 연결하는 안내는 `docs/handoff/`, 날짜별 조사 묶음은 `docs/handoff/research/`, 이미지 제작 과정은 `docs/design-concepts/` 또는 해당 에셋 폴더에 둔다. 기능이 추가되면 이 목차와 관련 하위 목차에 링크를 추가하고, 과거 검증 결과는 당시 날짜와 함께 보존한다.
