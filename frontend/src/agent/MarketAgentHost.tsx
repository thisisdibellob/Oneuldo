import { randomUUID } from 'expo-crypto';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { MarketSimulationScreen } from '../screens/MarketSimulationScreen';
import { createMarketSession, type MarketSessionConfig } from '../game/marketSession';
import type { MarketAgentBrowserCommand, MarketAgentBrowserEnvelope, MarketAgentController, MarketAgentStartInput } from './marketAgentProtocol';
import { isMarketAgentBrowserCommand, MARKET_AGENT_PROTOCOL_VERSION } from './marketAgentProtocol';

type ActiveRun = {
  input: MarketAgentStartInput;
  initialConfig: Partial<MarketSessionConfig>;
  maxSteps: number;
  requestId: string;
  sessionId: string;
};

function send(socket: WebSocket | null, message: MarketAgentBrowserEnvelope) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function resolveBrowserId() {
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const existing = url.searchParams.get('marketAgentBrowserId')?.trim();
    if (existing) return existing;
    const generated = randomUUID();
    url.searchParams.set('marketAgentBrowserId', generated);
    window.history.replaceState(window.history.state, '', url.toString());
    return generated;
  }
  return randomUUID();
}

export function MarketAgentHost({ accessToken, fallback }: { accessToken: string | null; fallback: ReactNode }) {
  const socket = useRef<WebSocket | null>(null);
  const controller = useRef<MarketAgentController | null>(null);
  const acknowledgedStarts = useRef(new Set<string>());
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [controllerReady, setControllerReady] = useState(false);
  const [browserId] = useState(resolveBrowserId);
  const authenticated = useRef(false);
  const gameVisible = useRef(false);
  authenticated.current = !!accessToken;
  gameVisible.current = !!activeRun;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgeUrl = process.env.EXPO_PUBLIC_MARKET_AGENT_WS_URL ?? 'ws://127.0.0.1:8765/browser';

  const browserState = useCallback((): MarketAgentBrowserEnvelope => ({
    type: 'browserReady', protocolVersion: MARKET_AGENT_PROTOCOL_VERSION, browserId,
    url: typeof window === 'undefined' ? null : window.location.href,
    title: typeof document === 'undefined' ? null : document.title,
    visibility: typeof document === 'undefined' ? null : document.visibilityState,
    authenticated: authenticated.current,
    view: gameVisible.current ? 'game' : authenticated.current ? 'app' : 'login',
  }), [browserId]);

  const fail = useCallback((requestId: string, error: unknown) => {
    const item = error as { code?: string; message?: string; details?: unknown };
    send(socket.current, { type: 'error', requestId, error: {
      code: item?.code ?? 'BROWSER_ERROR', message: item?.message ?? String(error), details: item?.details,
    } });
  }, []);

  const handle = useCallback(async (command: MarketAgentBrowserCommand) => {
    try {
      if (command.type === 'start') {
        if (!accessToken) throw Object.assign(new Error('오른쪽 오늘도 화면에서 먼저 로그인해 주세요.'), { code: 'AUTH_REQUIRED' });
        if (!command.input.agentModel?.trim() || !command.input.personaId?.trim()) throw Object.assign(new Error('agentModel과 personaId는 필수입니다.'), { code: 'INVALID_PROVENANCE' });
        const maxSteps = command.input.maxSteps ?? 2000;
        if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100_000) throw Object.assign(new Error('maxSteps는 1 이상 100000 이하의 정수여야 합니다.'), { code: 'INVALID_MAX_STEPS' });
        const sessionId = command.input.sessionId ?? randomUUID();
        const initialConfig: Partial<MarketSessionConfig> = {
          ...(command.input.config ?? {}), sessionId,
          startedAt: command.input.startedAt ?? new Date().toISOString(),
          provenance: {
            source: 'synthetic', agentModel: command.input.agentModel, personaId: command.input.personaId,
            personaVersion: command.input.personaVersion, notes: command.input.notes,
          },
        };
        createMarketSession(initialConfig);
        controller.current = null;
        setControllerReady(false);
        setActiveRun({ input: command.input, initialConfig, maxSteps, requestId: command.requestId, sessionId });
        return;
      }
      const current = controller.current;
      if (!current || current.sessionId !== command.input.sessionId) throw Object.assign(new Error('브라우저에서 실행 중인 세션을 찾을 수 없습니다.'), { code: 'SESSION_NOT_FOUND' });
      const payload = command.type === 'observe' ? current.observe()
        : command.type === 'action' ? await current.execute(command.input)
          : command.type === 'export' ? await current.exportEpisode()
            : await current.stop(command.input.reason);
      send(socket.current, { type: 'result', requestId: command.requestId, payload });
      if (command.type === 'stop') {
        controller.current = null;
        setControllerReady(false);
        setActiveRun(null);
      }
    } catch (error) {
      fail(command.requestId, error);
    }
  }, [accessToken, fail]);

  useEffect(() => {
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const next = new WebSocket(bridgeUrl);
      socket.current = next;
      const announce = () => send(next, browserState());
      next.onopen = announce;
      next.onmessage = event => {
        let command: unknown;
        try { command = JSON.parse(String(event.data)); }
        catch { return; }
        if (isMarketAgentBrowserCommand(command)) void handle(command);
      };
      next.onclose = () => {
        if (socket.current === next) socket.current = null;
        if (!disposed) reconnectTimer.current = setTimeout(connect, 1000);
      };
      next.onerror = () => next.close();
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', announce);
      next.addEventListener('close', () => {
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', announce);
      });
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socket.current?.close();
      socket.current = null;
    };
  }, [bridgeUrl, browserId, browserState, handle]);

  useEffect(() => {
    send(socket.current, browserState());
  }, [accessToken, activeRun, browserState]);

  const agentControl = useMemo(() => activeRun ? {
    maxSteps: activeRun.maxSteps,
    sessionId: activeRun.sessionId,
    provenance: {
      agentModel: activeRun.input.agentModel,
      personaId: activeRun.input.personaId,
      personaVersion: activeRun.input.personaVersion,
    },
    onReady: (next: MarketAgentController | null) => {
      controller.current = next;
      setControllerReady(next !== null);
      if (!next || acknowledgedStarts.current.has(activeRun.requestId)) return;
      acknowledgedStarts.current.add(activeRun.requestId);
      send(socket.current, { type: 'result', requestId: activeRun.requestId, payload: next.observe() });
    },
  } : null, [activeRun]);

  if (!accessToken || !activeRun || !agentControl) return <>{fallback}</>;
  return <View style={styles.root}>
    <MarketSimulationScreen
      accessToken={accessToken}
      agentControl={agentControl}
      initialConfig={activeRun.initialConfig}
      key={activeRun.sessionId}
      onExit={() => setActiveRun(null)}
    />
    {!controllerReady ? <View pointerEvents="none" style={styles.loading}>
      <ActivityIndicator />
      <Text>AI 장보기 화면을 연결하고 있어요.</Text>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.75)', justifyContent: 'center' },
});
