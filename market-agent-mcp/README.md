# Oneuldo Market Agent MCP

Codex가 실제 브라우저에 열린 오늘도 장보기 화면을 읽고 직접 행동하도록 하는 단일 공유 서비스입니다. `127.0.0.1:8765/mcp`에서 Streamable HTTP MCP를, 같은 포트의 `/browser`에서 WebSocket 브리지를 제공합니다. 여러 Codex 작업은 이 서비스 하나를 공유하므로 작업별 포트 충돌이 발생하지 않습니다. 브라우저는 기존 `frontend/src/game/marketSession.ts` 상태 머신과 행동 로그 업로드 경로를 그대로 사용합니다.

## 제공 도구

- `market_bridge_status`: 브라우저 연결 및 현재 작업의 제어권 확인
- `market_start`: 합성 AI 세션 시작
- `market_observe`: 현재 화면 전체 관찰
- `market_move`: 상대 좌표로 최대 32px 직접 이동
- `market_act`: 상호작용, 상품 선택, 도움, 계산, 종료
- `market_stop`: 실행 중단, 행동 로그 저장 완료 및 제어권 해제
- `market_export_episode`: 종료 후 전체 에피소드 내보내기

자동 경로 탐색이나 목적지 순간이동 도구는 제공하지 않습니다. AI는 `market_move`의 `dx`, `dy`를 직접 결정해야 합니다.

관찰값의 `screen.world`에는 화면에서 파악할 수 있는 지도 크기, 진열대, 직원·손님, 시설, 벽, 통행 영역, 계산대, 경보기와 공사 구역이 들어갑니다. `screen.visiblePanel`에는 현재 열린 화면에서 실제로 공개되는 상품, 재고, 장바구니, 결제 및 피드백 정보가 들어갑니다. 열지 않은 진열대의 상품이나 제출 전 정답처럼 화면에 보이지 않는 값은 포함하지 않습니다.

## 실행과 테스트

최초 한 번 MCP 의존성을 설치합니다.

```sh
cd /Users/mymacbookair/Desktop/Project/Oneuldo/market-agent-mcp
npm install
npm test
npm start
```

`npm start`는 공유 서비스를 한 번만 실행합니다. Codex 작업마다 별도로 실행하지 않습니다. 다음 주소로 상태를 확인할 수 있습니다.

```sh
curl http://127.0.0.1:8765/health
```

실제 브라우저 실행에는 백엔드와 프론트엔드를 켜고 아래 주소에 먼저 접근합니다. 로그인되지 않았다면 해당 화면에서 로그인한 뒤 같은 URL을 유지합니다.

```text
http://localhost:8082/?marketAgent=1&marketAgentBrowserId=<작업별-UUID>
```

프론트는 `EXPO_PUBLIC_MARKET_AGENT_WS_URL`이 없으면 `ws://127.0.0.1:8765/browser`에 연결합니다. 브라우저가 연결되지 않은 상태에서는 MCP가 별도 인메모리 게임으로 대체하지 않고 `BROWSER_NOT_CONNECTED`를 반환합니다. 테스트용 기존 인메모리 STDIO 런타임은 `npm run start:local-runtime`으로만 실행합니다.

브라우저 브리지 프로토콜 버전은 `2`입니다. 브리지와 프론트 변경 후에는 둘 다 재시작해야 합니다.

브리지는 연결된 화면을 `marketAgentBrowserId`로 구분하며 `market_start.browserId`로 지정한 화면에만 명령을 전달합니다. 같은 ID의 화면이 다시 연결되면 새 연결이 이전 연결을 교체합니다. 하나의 Codex MCP 세션만 제어권을 가지며, 다른 작업이 이미 실행 중이면 `BROWSER_BUSY`를 반환합니다. 기존 작업이 `market_stop` 또는 `market_export_episode`를 호출하거나 MCP 연결이 종료되면 제어권이 반환됩니다. 유휴 제어권은 기본 30분 뒤 만료됩니다.

행동 요청에는 `actionId`와 직전 응답의 `expectedRevision`을 전달합니다. 같은 `actionId`를 재전송하면 행동을 중복 적용하지 않고 이전 결과를 반환합니다.

브라우저 실행 이벤트는 로그인된 사용자의 JWT와 기존 `/api/behavior-logs/batches`를 통해 기존 DB에 저장됩니다. 로컬 JSONL 및 episode 파일은 `ONEULDO_MARKET_RUNTIME=local` 테스트 모드에서만 생성됩니다.

## Codex 연결

`codex-config.example.toml`의 내용을 프로젝트 또는 사용자 Codex 설정에 추가합니다. 기존 `command`/`args` 기반 `oneuldoMarket` 설정은 제거하고 다음 URL 설정으로 교체해야 합니다.

```toml
[mcp_servers.oneuldoMarket]
url = "http://127.0.0.1:8765/mcp"
required = true
startup_timeout_sec = 20
tool_timeout_sec = 120
```

공유 서비스를 먼저 실행한 뒤 Codex에서 MCP 서버를 재시작합니다.

권장 대화 지시문:

```text
oneuldoMarket 도구를 사용해 장보기 게임을 수행해.
작업별 browserId UUID를 정하고 ?marketAgent=1&marketAgentBrowserId=<browserId> 주소를 오른쪽에 열어.
같은 browserId로 market_bridge_status의 target을 확인한 다음 market_start를 호출해.
목적지까지의 dx/dy는 네가 판단해서 market_move로 한 번에 최대 32px씩 직접 이동해.
행동마다 직전 revision과 새로운 actionId를 사용해.
게임이 끝날 때까지 화면에 공개된 정보만으로 판단해.
```
