import { validateMarketReplayTrace } from '../game/marketReplayTrace';
import { playMarketTrace, type ReplayProgress } from './player';
import type { ReplayMotionPort, ReplayUiPort } from './ports';

type Pairing = { tabId: string; token: string; epoch: string; bridgeUrl: string; backendOrigin: string; memberId: string };
let pairing: Pairing | null = null;
function consumePairing(): Pairing | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const value = fragment.get('marketReplay');
  if (value) {
    fragment.delete('marketReplay');
    window.history.replaceState(null, '', window.location.pathname + window.location.search + (fragment.size ? '#' + fragment.toString() : ''));
    const parsed = JSON.parse(value) as Pairing;
    const url = new URL(parsed.bridgeUrl);
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.pathname !== '/replay' || url.username || url.password || url.search || url.hash) {
      throw new Error('Replay bridge must be an authenticated loopback WebSocket');
    }
    if (!parsed.tabId || !parsed.epoch || typeof parsed.token !== 'string' || parsed.token.length < 32 || !parsed.memberId) throw new Error('Invalid replay pairing');
    pairing = parsed;
  }
  return pairing;
}

export async function connectMarketReplay(options: {
  accessToken: string | null | undefined; ui: () => ReplayUiPort | null; motion: () => ReplayMotionPort;
  status: (text: string) => void;
}): Promise<() => void> {
  if (!__DEV__ || typeof window === 'undefined' || new URLSearchParams(window.location.search).get('marketReplay') !== '1') return () => {};
  const bootstrap = consumePairing();
  if (!bootstrap) { options.status('재생 연결 URL이 필요합니다.'); return () => {}; }
  if (!options.accessToken) { options.status('전용 테스트 계정으로 로그인해 주세요.'); return () => {}; }
  const api = process.env.EXPO_PUBLIC_API_URL;
  if (!api || new URL(api).origin !== bootstrap.backendOrigin || api.replace(/\/$/, '') !== bootstrap.backendOrigin) throw new Error('The configured backend does not match the isolated replay target');
  const memberResponse = await fetch(`${api}/api/members/me`, { headers: { Authorization: `Bearer ${options.accessToken}` }, redirect: 'error' });
  if (!memberResponse.ok) throw new Error('Replay account verification failed');
  const member = await memberResponse.json() as { id?: string };
  if (String(member.id) !== bootstrap.memberId) throw new Error('This account is not the paired test account');
  const socket = new WebSocket(bootstrap.bridgeUrl);
  let disposed = false, lastServerMessage = Date.now(), welcomed = false, replayId: string | undefined;
  let controller: AbortController | null = null, current: ReplayProgress | null = null;
  const attemptedSessions = new Set<string>();
  let lastSessionId: string | undefined, lastSnapshot: ReturnType<ReplayUiPort['snapshot']> | undefined;
  const app = () => {
    const ui = options.ui();
    let ready = false;
    if (ui && ui.sessionId()) {
      lastSessionId = ui.sessionId()!;
      // The initial snapshot is immutable, but ready only means the briefing is untouched.
      try {
        if (ui.read().briefing || controller) lastSnapshot = ui.snapshot();
        ready = ui.read().briefing && ui.read().briefingStep === 0 && !controller && !attemptedSessions.has(lastSessionId!);
      } catch {
        // The initial layout/zoom animation may still be settling; never advertise an unbound fixture.
        lastSnapshot = undefined;
      }
    }
    return { origin: window.location.origin, backendOrigin: bootstrap.backendOrigin, memberId: bootstrap.memberId,
      ready, visible: document.visibilityState === 'visible', sessionId: lastSessionId,
      ...(lastSnapshot ? { snapshot: lastSnapshot, questInstanceId: lastSnapshot.mission?.scene?.questInstanceId } : {}) };
  };
  const send = (message: Record<string, unknown>) => {
    if (!disposed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ tabId: bootstrap.tabId, epoch: bootstrap.epoch, ...message }));
  };
  const stop = (reason: string) => { controller?.abort(reason); options.motion().stop(); };
  const sendStatus = () => send({ type: 'status', replayId, ...(current ?? {}), app: app() });
  socket.onopen = () => { send({ type: 'hello', protocolVersion: 1, token: bootstrap.token, app: app() }); };
  socket.onmessage = event => {
    let responseReplayId = replayId;
    try {
      const message = JSON.parse(String(event.data));
      if (message.epoch !== bootstrap.epoch) throw new Error('Bridge epoch mismatch');
      // A play can race with a human advancing the briefing. Reject that request by its
      // own ID so the bridge releases its starting lease even before playback begins.
      if (message.type === 'play' && typeof message.replayId === 'string') responseReplayId = message.replayId;
      lastServerMessage = Date.now();
      if (message.type === 'ready') { welcomed = true; options.status('재생 연결됨 · 장보기 브리핑에서 대기'); sendStatus(); return; }
      if (message.type === 'heartbeat') return;
      if (message.type === 'stop') { stop(message.reason ?? 'Stopped by MCP'); return; }
      if (message.type === 'error') throw new Error(message.message ?? 'Bridge rejected the session');
      if (message.type !== 'play') throw new Error('Unsupported bridge message');
      if (!welcomed || controller || document.visibilityState !== 'visible') throw new Error('App is not available for replay');
      const ui = options.ui();
      if (!ui || !ui.read().briefing || ui.read().briefingStep !== 0 || !ui.sessionId() || attemptedSessions.has(ui.sessionId()!)) {
        throw new Error('Open a fresh shopping session on the first briefing page');
      }
      const validation = validateMarketReplayTrace(message.trace, ui.snapshot());
      if (!validation.valid) throw new Error(validation.errors.join('; '));
      replayId = message.replayId;
      attemptedSessions.add(ui.sessionId()!);
      controller = new AbortController();
      const active = controller;
      void playMarketTrace(message.trace, options.ui, options.motion(), active.signal, progress => {
        current = progress; sendStatus();
        options.status(`${progress.status} · ${Math.min(progress.stepIndex + 1, message.trace.steps.length)}/${message.trace.steps.length}${progress.error ? ' · ' + progress.error : ''}`);
      }).catch(error => {
        send({ type: 'status', replayId, status: 'failed', error: String(error), app: app() });
        options.status(String(error));
      }).finally(() => { controller = null; sendStatus(); });
    } catch (error) {
      stop(String(error)); options.status(String(error));
      send({ type: 'status', replayId: responseReplayId, status: 'failed', error: String(error), app: app() });
    }
  };
  socket.onerror = () => { stop('Bridge connection error'); options.status('재생 연결 오류'); };
  socket.onclose = () => { stop('Bridge disconnected'); options.status('재생 연결 종료 · 새 연결 URL이 필요합니다.'); };
  const interval = setInterval(() => {
    if (Date.now() - lastServerMessage > 8000) { stop('Bridge heartbeat expired'); socket.close(); return; }
    if (welcomed) { send({ type: 'heartbeat', replayId, app: app() }); sendStatus(); }
  }, 2000);
  const hidden = () => { if (document.visibilityState !== 'visible') stop('Tab became hidden; realtime replay stopped'); };
  const userInput = (event: Event) => { if (event.isTrusted && controller) stop('Manual input interrupted replay'); };
  document.addEventListener('visibilitychange', hidden);
  document.addEventListener('pointerdown', userInput, true);
  document.addEventListener('keydown', userInput, true);
  return () => {
    disposed = true; stop('Replay screen or account changed'); clearInterval(interval); socket.close();
    document.removeEventListener('visibilitychange', hidden);
    document.removeEventListener('pointerdown', userInput, true);
    document.removeEventListener('keydown', userInput, true);
  };
}
