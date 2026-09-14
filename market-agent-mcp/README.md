# Oneuldo Market Agent MCP

Codex가 오늘도 장보기 시뮬레이션의 화면 의미를 읽고 직접 행동하도록 하는 독립 STDIO MCP 서버입니다. 기존 프론트엔드와 백엔드를 수정하지 않으며, 게임 규칙은 `frontend/src/game/marketSession.ts`의 상태 머신을 그대로 사용합니다.

## 제공 도구

- `market_start`: 합성 AI 세션 시작
- `market_observe`: 현재 화면 전체 관찰
- `market_move`: 상대 좌표로 최대 32px 직접 이동
- `market_act`: 상호작용, 상품 선택, 도움, 계산, 종료
- `market_export_episode`: 종료 후 전체 에피소드 내보내기

자동 경로 탐색이나 목적지 순간이동 도구는 제공하지 않습니다. AI는 `market_move`의 `dx`, `dy`를 직접 결정해야 합니다.

관찰값의 `screen.world`에는 화면에서 파악할 수 있는 지도 크기, 진열대, 직원·손님, 시설, 벽, 통행 영역, 계산대, 경보기와 공사 구역이 들어갑니다. `screen.visiblePanel`에는 현재 열린 화면에서 실제로 공개되는 상품, 재고, 장바구니, 결제 및 피드백 정보가 들어갑니다. 열지 않은 진열대의 상품이나 제출 전 정답처럼 화면에 보이지 않는 값은 포함하지 않습니다.

## 실행과 테스트

별도 패키지 설치는 필요하지 않습니다. 프로젝트의 `frontend/node_modules/typescript`만 사용합니다.

```sh
cd /Users/mymacbookair/Desktop/Project/Oneuldo/market-agent-mcp
npm test
npm start
```

행동 요청에는 `actionId`와 직전 응답의 `expectedRevision`을 전달합니다. 같은 `actionId`를 재전송하면 행동을 중복 적용하지 않고 이전 결과를 반환합니다.

실행 이벤트는 기본적으로 `market-agent-mcp/data/<sessionId>.jsonl`에 저장됩니다. 세션이 종료되면 전체 게임 이벤트를 담은 `<sessionId>.episode.json`도 자동 저장됩니다. 다른 위치를 쓰려면 `ONEULDO_MARKET_MCP_DATA_DIR` 환경 변수를 설정합니다. `data/`는 Git에서 제외됩니다.

## Codex 연결

`codex-config.example.toml`의 내용을 프로젝트 또는 사용자 Codex 설정에 추가한 뒤 새 Codex 세션에서 사용합니다. 설정 파일 자체는 기존 프로젝트 설정과 충돌하지 않도록 예제로만 제공하며 자동 적용하지 않습니다.

권장 대화 지시문:

```text
oneuldoMarket 도구를 사용해 장보기 게임을 수행해.
먼저 market_start를 호출하고, 매 응답의 observation을 현재 화면 전체로 이해해.
목적지까지의 dx/dy는 네가 판단해서 market_move로 한 번에 최대 32px씩 직접 이동해.
행동마다 직전 revision과 새로운 actionId를 사용해.
게임이 끝날 때까지 화면에 공개된 정보만으로 판단해.
```
