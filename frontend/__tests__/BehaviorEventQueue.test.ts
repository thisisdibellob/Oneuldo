import AsyncStorage from '@react-native-async-storage/async-storage';

import { recordBehaviorLogBatch } from '../src/api/behaviorLog';
import { enqueueBehaviorLogBatch, flushBehaviorLogQueue } from '../src/behavior/behaviorEventQueue';
import { buildMarketCheckoutEvents, MarketBehaviorSession } from '../src/behavior/marketBehaviorTracker';
import { evaluateMarketCart } from '../src/game/scenarios';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  randomUUID: jest.fn(() => '20000000-0000-4000-8000-000000000001'),
}));

jest.mock('../src/api/behaviorLog', () => ({
  BehaviorLogApiError: class BehaviorLogApiError extends Error {
    readonly status: number;

    constructor(mockStatus: number, message: string) {
      super(message);
      this.status = mockStatus;
    }
  },
  recordBehaviorLogBatch: jest.fn(),
}));

const mockedRecordBehaviorLogBatch = jest.mocked(recordBehaviorLogBatch);

const session: MarketBehaviorSession = {
  evidenceContext: 'ASSESSMENT_TASK',
  sessionId: '10000000-0000-4000-8000-000000000001',
  simulation: {
    contentSource: 'GENERATED',
    questInstanceId: '90000000-0000-4000-8000-000000000001',
    simulationStarted: true,
  },
  startedAt: '2026-08-29T10:00:00.000Z',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

it('네트워크 실패 뒤 재전송되는 이벤트만 offlineQueued로 표시한다', async () => {
  const events = buildMarketCheckoutEvents(
    session,
    { apple: 2, curry: 1, milk: 1 },
    evaluateMarketCart({ apple: 2, curry: 1, milk: 1 }),
    new Date('2026-08-29T10:01:00.000Z'),
  );
  mockedRecordBehaviorLogBatch
    .mockRejectedValueOnce(new TypeError('network error'))
    .mockResolvedValueOnce({
      batchId: '20000000-0000-4000-8000-000000000001',
      events: events.map((event) => ({
        clientEventId: event.metadata.clientEventId,
        eventSequence: event.metadata.eventSequence,
        id: event.metadata.clientEventId,
        receivedAt: '2026-08-29T10:01:01.000Z',
        status: 'ACCEPTED' as const,
      })),
    });

  await enqueueBehaviorLogBatch('token', events);
  await flushBehaviorLogQueue('token');
  await flushBehaviorLogQueue('token');

  expect(mockedRecordBehaviorLogBatch.mock.calls[0][1]
    .every((event) => event.metadata.offlineQueued === false)).toBe(true);
  expect(mockedRecordBehaviorLogBatch.mock.calls[1][1]
    .every((event) => event.metadata.offlineQueued === true)).toBe(true);
});
