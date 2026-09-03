import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

import {
  BehaviorLogApiError,
  type BehaviorLogRequest,
  type BehaviorPriority,
  recordBehaviorLogBatch,
} from '../api/behaviorLog';

type QueuedBehaviorEvent = {
  event: BehaviorLogRequest;
  priority: BehaviorPriority;
  queuedAt: string;
};

const QUEUE_PREFIX = 'oneuldo.behavior-event-outbox.v2';
const DEAD_LETTER_PREFIX = 'oneuldo.behavior-event-dead-letter.v2';
const UPLOAD_BATCH_SIZE = 50;
const AUTO_UPLOAD_EVENT_COUNT = 20;
const MAX_QUEUED_EVENTS = 2000;

const operations = new Map<string, Promise<unknown>>();
const flushing = new Set<string>();

async function ownerKey(accessToken: string) {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, accessToken);
  return digest.slice(0, 20);
}

async function storageKey(prefix: string, accessToken: string) {
  return `${prefix}.${await ownerKey(accessToken)}`;
}

async function readQueue(key: string): Promise<QueuedBehaviorEvent[]> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as QueuedBehaviorEvent[] : [];
  } catch {
    return [];
  }
}

async function writeQueue(key: string, queue: QueuedBehaviorEvent[]) {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(queue));
}

function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operations.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  operations.set(key, current);
  const cleanup = () => {
    if (operations.get(key) === current) operations.delete(key);
  };
  void current.then(cleanup, cleanup);
  return current;
}

function applyBackpressure(events: QueuedBehaviorEvent[]) {
  if (events.length <= MAX_QUEUED_EVENTS) return events;
  const retained = [...events];
  for (const priority of ['low', 'normal'] as const) {
    for (let index = 0; index < retained.length && retained.length > MAX_QUEUED_EVENTS;) {
      if (retained[index].priority === priority) retained.splice(index, 1);
      else index += 1;
    }
  }
  return retained.slice(-MAX_QUEUED_EVENTS);
}

export async function enqueueBehaviorEvents(
  accessToken: string,
  events: Array<{ event: BehaviorLogRequest; priority: BehaviorPriority }>,
) {
  if (events.length === 0) return 0;
  const key = await storageKey(QUEUE_PREFIX, accessToken);
  const count = await serialized(key, async () => {
    const queue = await readQueue(key);
    const queuedAt = new Date().toISOString();
    const next = applyBackpressure([
      ...queue,
      ...events.map((item) => ({ ...item, queuedAt })),
    ]);
    await writeQueue(key, next);
    return next.length;
  });
  if (count >= AUTO_UPLOAD_EVENT_COUNT) {
    void flushBehaviorEventQueue(accessToken).catch(() => undefined);
  }
  return count;
}

export async function flushBehaviorEventQueue(accessToken: string) {
  const key = await storageKey(QUEUE_PREFIX, accessToken);
  if (flushing.has(key)) return;
  flushing.add(key);
  try {
    await serialized(key, async () => {
      const deadLetterKey = await storageKey(DEAD_LETTER_PREFIX, accessToken);
      let queue = await readQueue(key);
      while (queue.length > 0) {
        const batch = queue.slice(0, UPLOAD_BATCH_SIZE);
        const batchId = randomUUID();
        try {
          const response = await recordBehaviorLogBatch(
            batchId,
            batch.map(({ event }) => event),
            accessToken,
          );
          const acknowledged = new Set(response.events
            .filter(({ status }) => status === 'ACCEPTED' || status === 'DUPLICATE')
            .map(({ clientEventId }) => clientEventId));
          if (acknowledged.size !== batch.length) break;
          queue = queue.slice(batch.length);
          await writeQueue(key, queue);
        } catch (error) {
          if (error instanceof BehaviorLogApiError && error.status >= 400 && error.status < 500
            && error.status !== 401 && error.status !== 408 && error.status !== 429) {
            const deadLetters = await readQueue(deadLetterKey);
            await writeQueue(deadLetterKey, [...deadLetters, ...batch]);
            queue = queue.slice(batch.length);
            await writeQueue(key, queue);
            continue;
          }
          const offlineQueue = queue.map((item, index) => index < batch.length ? {
            ...item,
            event: {
              ...item.event,
              metadata: { ...item.event.metadata, offlineQueued: true },
            },
          } : item);
          await writeQueue(key, offlineQueue);
          break;
        }
      }
    });
  } finally {
    flushing.delete(key);
  }
}

export async function getQueuedBehaviorEventCount(accessToken: string) {
  const key = await storageKey(QUEUE_PREFIX, accessToken);
  return (await readQueue(key)).length;
}
