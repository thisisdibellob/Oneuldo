import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BehaviorLogRequest } from '../src/api/behaviorLog';
import { recordBehaviorLogBatch } from '../src/api/behaviorLog';
import {
  enqueueBehaviorEvents,
  flushBehaviorEventQueue,
  getQueuedBehaviorEventCount,
} from '../src/behavior/behaviorEventQueue';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn(async () => 'owner-hash-1234567890'),
  randomUUID: jest.fn(() => '20000000-0000-4000-8000-000000000001'),
}));

jest.mock('../src/api/behaviorLog', () => {
  const actual = jest.requireActual('../src/api/behaviorLog');
  return { ...actual, recordBehaviorLogBatch: jest.fn() };
});

const mockedRecord = jest.mocked(recordBehaviorLogBatch);

function event(index: number): BehaviorLogRequest {
  return {
    accessibility: {
      audioEnabled: false,
      controllerMode: 'TOUCH',
      instructionMode: 'TEXT',
      symbolSupport: true,
      textLevel: 'STANDARD',
    },
    action: {
      eventCode: 'SHOP.QUANTITY_CHANGED',
      microActionId: `ADD_${index}`,
      stepOrder: index + 1,
    },
    identity: { sessionId: '10000000-0000-4000-8000-000000000001' },
    metadata: {
      appVersion: '1.0.0',
      clientEventId: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      contentVersion: 'test',
      eventSchemaVersion: 'behavior-event-v1',
      eventSequence: index + 1,
      occurredAt: new Date(index * 1000).toISOString(),
      offlineQueued: false,
    },
    payload: { itemId: 'apple', type: 'SHOPPING' },
    simulation: {
      contentSource: 'STATIC',
      questInstanceId: '40000000-0000-4000-8000-000000000001',
      simulationStarted: true,
    },
    task: {
      difficulty: 2,
      evidenceContext: 'ASSESSMENT_TASK',
      gameId: 'MARKET_SIMULATION',
      scenarioVariant: 'BASELINE',
      taskId: '50000000-0000-4000-8000-000000000001',
      taskVersion: 'test',
    },
  };
}

describe('행동 로그 영구 Outbox', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockedRecord.mockReset();
  });

  it('여러 이벤트를 한 요청으로 전송하고 ACK 이후에만 제거한다', async () => {
    const events = Array.from({ length: 10 }, (_, index) => event(index));
    mockedRecord.mockImplementation(async (batchId, requests) => ({
      batchId,
      events: requests.map((request) => ({
        clientEventId: request.metadata.clientEventId,
        eventSequence: request.metadata.eventSequence,
        id: request.metadata.clientEventId,
        receivedAt: request.metadata.occurredAt,
        status: 'ACCEPTED',
      })),
    }));

    await enqueueBehaviorEvents('token', events.map((item) => ({ event: item, priority: 'high' })));
    expect(await getQueuedBehaviorEventCount('token')).toBe(10);

    await flushBehaviorEventQueue('token');

    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord.mock.calls[0][1]).toHaveLength(10);
    expect(await getQueuedBehaviorEventCount('token')).toBe(0);
  });

  it('네트워크 오류가 나면 이벤트를 큐에 남기고 offlineQueued로 표시한다', async () => {
    mockedRecord.mockRejectedValueOnce(new Error('offline'));
    await enqueueBehaviorEvents('another-token', [{ event: event(100), priority: 'critical' }]);

    await flushBehaviorEventQueue('another-token');

    expect(await getQueuedBehaviorEventCount('another-token')).toBe(1);
  });

  it('대량의 낮은 우선순위 이벤트도 용량 제한으로 폐기하지 않는다', async () => {
    const events = Array.from({ length: 2050 }, (_, index) => ({
      event: event(index + 1000),
      priority: 'low' as const,
    }));
    mockedRecord.mockRejectedValue(new Error('offline'));

    const queued = await enqueueBehaviorEvents('large-queue-token', events);

    expect(queued).toBe(2050);
    expect(await getQueuedBehaviorEventCount('large-queue-token')).toBe(2050);
  });
});
