# 프론트엔드 게임 기능 문서

목차 정리일: **2026-10-17**. [전체 문서 안내](../../docs/document-index.md) · [개발 인수인계](../../docs/handoff/README.md) · [작업 규칙](../AGENTS.md)

## 기능을 수정할 때

| 문서 | 확인할 내용 |
| --- | --- |
| [장보기 실행 인터페이스](market-agent-contract.md) | 설정·관측·행동·에피소드·출처 기록. 모델 호출과 서버 연결은 별도 |
| [마트 배치 편집](market-tilemap-editor.md) | 그리드·좌표·JSON·보관함·미리보기·적용 시점과 플랫폼별 저장 |
| [카페 첫 근무](cafe-shift.md) | 주문부터 완료 보고까지, 음료 규칙·이미지 비율·상태/API·저장 |
| [빨래하는 날](laundry-day.md) | 빨래 분류·세탁·건조·정리, 상태/API·결과와 저장 |
| [수상한 연락 확인하기](phishing-safety-game.md) | 사칭/정상 연락 구분, 확인·도움·회복, 스마트폰·마을 진입 |
| [마을·장보기·공통 기능](../../docs/handoff/world-market-shared-2026-10-13.md) | 이동·카메라·스프라이트·HUD·휴대폰·앨범·요리·계산 알바 |
| [도서관·버스](../../docs/handoff/library-bus-2026-10-13.md) | 근무·탑승·손님·돌발상황·완료 흐름과 상태 경계 |

문서별 작성·추가 날짜와 확인 범위를 함께 읽는다. 설정 예제가 있다고 실서버가 연결된 것은 아니며, 문서의 검증 숫자는 당시 기록이다. 빨래방 문서의 전체 화면 통합 검증은 아직 기록이 미완인 상태로 구분한다.

## JSON 예제

- [그리드 배치 단독](examples/market-tilemap-layout.json)
- [그리드 배치를 포함한 세션 설정](examples/market-tilemap-session.json)
- [기존 모퉁이 지점·공사 설정](examples/market-corner-construction.json)

배치 JSON과 전체 게임 세션 JSON은 역할이 다르다. 필드와 검증 범위는 [배치 편집 안내](market-tilemap-editor.md)와 [장보기 계약](market-agent-contract.md)을 기준으로 읽는다.

## 제작·이전 기록

| 문서 | 역할 |
| --- | --- |
| [버스 아트 제작](bus-art-prompts.md) | 여러 버전의 그림·프롬프트·배치 수정 이력. 현재 버전은 최신 항목과 런타임 매핑 확인 |
| [게임 아트 바이블 v0.1](game-art-bible.md) | 초기 디자인 제안. 현재 캐릭터·조작 규격을 대체하지 않음 |
| [Expo SDK 57 이전](expo-sdk-57-upgrade.md) | 의존성·호환성·실행 방식과 당시 확인 기록. 설치 버전은 package.json/잠금 파일 우선 |

조사 근거는 [연구 안내](../../docs/handoff/research/README.md), 보고서·일지용 변경 이력은 [전체 문서 안내](../../docs/document-index.md)에서 찾는다.
