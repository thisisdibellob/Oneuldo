import { connectMarketReplay } from '../src/replay/connection';
import { playMarketTrace } from '../src/replay/player';

jest.mock('../src/replay/player', () => ({ playMarketTrace: jest.fn() }));
jest.mock('../src/game/marketReplayTrace', () => ({ validateMarketReplayTrace: () => ({ valid: true, errors: [] }) }));

const descriptors = new Map(['window', 'document', 'WebSocket', 'fetch', '__DEV__'].map(
  name => [name, Object.getOwnPropertyDescriptor(globalThis, name)],
));
const previousApi = process.env.EXPO_PUBLIC_API_URL;
const pairedMember = '10000000-0000-4000-8000-000000000001';
const bootstrap = { tabId: 'tab-test', token: 'a'.repeat(48), epoch: 'epoch-test',
  bridgeUrl: 'ws://127.0.0.1:8765/replay', backendOrigin: 'http://127.0.0.1:18080', memberId: pairedMember };
const setGlobal = (name: string, value: unknown) => Object.defineProperty(globalThis, name, {
  configurable: true, writable: true, value,
});

function setup({ development = true, search = '?marketReplay=1', browser = true } = {}) {
  const socket = { close: jest.fn(), send: jest.fn(), readyState: 0 };
  const websocket = Object.assign(jest.fn(() => socket), { OPEN: 1 });
  const fetch = jest.fn(async () => ({ ok: true, json: async () => ({ id: pairedMember }) }));
  const document = { visibilityState: 'visible', addEventListener: jest.fn(), removeEventListener: jest.fn() };
  const window = { location: { search, pathname: '/', origin: 'http://localhost:18082',
    hash: '#' + new URLSearchParams({ marketReplay: JSON.stringify(bootstrap) }).toString() },
    history: { replaceState: jest.fn() } };
  const motion = { stop: jest.fn() };
  const options = { accessToken: 'local-test-token', ui: jest.fn(() => null),
    motion: jest.fn(() => motion as any), status: jest.fn() };
  setGlobal('__DEV__', development);
  setGlobal('window', browser ? window : undefined);
  setGlobal('document', document);
  setGlobal('WebSocket', websocket);
  setGlobal('fetch', fetch);
  process.env.EXPO_PUBLIC_API_URL = bootstrap.backendOrigin;
  return { socket, websocket, fetch, document, window, options, motion };
}

beforeEach(() => { jest.useFakeTimers(); jest.mocked(playMarketTrace).mockReset(); });
afterEach(() => {
  jest.clearAllTimers(); jest.useRealTimers();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  if (previousApi === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = previousApi;
});

test.each([
  { description: 'development web without the flag', development: true, search: '' },
  { description: 'development web with an explicitly disabled flag', development: true, search: '?marketReplay=0' },
  { description: 'production even with flag and valid pairing', development: false, search: '?marketReplay=1' },
  { description: 'non-browser context', development: true, search: '?marketReplay=1', browser: false },
])('$description does not create a socket, fetch identity, register input listeners or start timers', async scenario => {
  const test = setup(scenario);
  const cleanup = await connectMarketReplay(test.options);
  cleanup();
  expect(test.websocket).not.toHaveBeenCalled();
  expect(test.fetch).not.toHaveBeenCalled();
  expect(test.document.addEventListener).not.toHaveBeenCalled();
  expect(test.window.history.replaceState).not.toHaveBeenCalled();
  expect(test.options.ui).not.toHaveBeenCalled();
  expect(test.options.motion).not.toHaveBeenCalled();
  expect(test.options.status).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('enabled development replay verifies /me before connecting and cleans up its listeners and heartbeat', async () => {
  const test = setup();
  const cleanup = await connectMarketReplay(test.options);
  expect(test.fetch).toHaveBeenCalledWith(bootstrap.backendOrigin + '/api/members/me', {
    headers: { Authorization: 'Bearer local-test-token' }, redirect: 'error',
  });
  expect(test.fetch.mock.invocationCallOrder[0]).toBeLessThan(test.websocket.mock.invocationCallOrder[0]);
  expect(test.websocket).toHaveBeenCalledTimes(1);
  expect(test.websocket).toHaveBeenCalledWith(bootstrap.bridgeUrl);
  expect(test.document.addEventListener).toHaveBeenCalledTimes(3);
  expect(jest.getTimerCount()).toBe(1);
  cleanup();
  expect(test.socket.close).toHaveBeenCalledTimes(1);
  expect(test.motion.stop).toHaveBeenCalledTimes(1);
  expect(test.document.removeEventListener).toHaveBeenCalledTimes(3);
  expect(jest.getTimerCount()).toBe(0);
});

test('a mismatched backend is rejected before even sending the login token', async () => {
  const test = setup();
  process.env.EXPO_PUBLIC_API_URL = 'https://production.example.invalid';
  await expect(connectMarketReplay(test.options)).rejects.toThrow('backend does not match');
  expect(test.fetch).not.toHaveBeenCalled();
  expect(test.websocket).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('a different logged-in account is rejected before opening a bridge connection', async () => {
  const test = setup();
  test.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'another-member' }) });
  await expect(connectMarketReplay(test.options)).rejects.toThrow('not the paired test account');
  expect(test.websocket).not.toHaveBeenCalled();
  expect(test.document.addEventListener).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

function attachMission(test: ReturnType<typeof setup>, briefingStep: number) {
  test.options.ui.mockReturnValue({
    sessionId: () => 'session-test', read: () => ({ briefing: true, briefingStep }), snapshot: () => ({}),
  } as any);
  const socket = test.socket as any;
  socket.readyState = 1;
  const receive = (message: Record<string, unknown>) => socket.onmessage({
    data: JSON.stringify({ epoch: bootstrap.epoch, ...message }),
  });
  return { socket, receive };
}

test('a partially read briefing never advertises ready and rejects play before any input', async () => {
  const test = setup();
  const { socket, receive } = attachMission(test, 1);
  const cleanup = await connectMarketReplay(test.options);
  socket.onopen(); receive({ type: 'ready' });
  expect(JSON.parse(test.socket.send.mock.calls[0][0]).app.ready).toBe(false);
  receive({ type: 'play', replayId: 'replay-1', trace: { steps: [] } });
  expect(playMarketTrace).not.toHaveBeenCalled();
  expect(test.options.status).toHaveBeenLastCalledWith(expect.stringContaining('first briefing page'));
  expect(JSON.parse(test.socket.send.mock.calls.at(-1)![0])).toMatchObject({
    type: 'status', replayId: 'replay-1', status: 'failed',
  });
  cleanup();
});

test('a stopped attempt cannot replay on the same still-open initial briefing', async () => {
  const test = setup();
  const { receive } = attachMission(test, 0);
  jest.mocked(playMarketTrace).mockResolvedValue(undefined);
  const cleanup = await connectMarketReplay(test.options);
  receive({ type: 'ready' });
  receive({ type: 'play', replayId: 'replay-1', trace: { steps: [] } });
  await jest.advanceTimersByTimeAsync(1);
  expect(playMarketTrace).toHaveBeenCalledTimes(1);
  const statuses = test.socket.send.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(statuses.at(-1).app.ready).toBe(false);
  receive({ type: 'play', replayId: 'replay-2', trace: { steps: [] } });
  expect(playMarketTrace).toHaveBeenCalledTimes(1);
  expect(test.options.status).toHaveBeenLastCalledWith(expect.stringContaining('fresh shopping session'));
  cleanup();
});
