import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

import {
  BehaviorLogApiError,
  BehaviorLogRequest,
  recordBehaviorLogBatch,
} from '../api/behaviorLog';

type QueuedBehaviorBatch = {
  batchId: string;
  events: BehaviorLogRequest[];
  queuedAt: string;
};

const STORAGE_PREFIX = 'oneuldo.behavior-log-queue.v1';
const DEAD_LETTER_PREFIX = 'oneuldo.behavior-log-dead-letter.v1';

async function ownerKey(accessToken: string) {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, accessToken);
  return digest.slice(0, 20);
}

async function storageKey(prefix: string, accessToken: string) {
  return `${prefix}.${await ownerKey(accessToken)}`;
}

async function readBatches(key: string): Promise<QueuedBehaviorBatch[]> {
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as QueuedBehaviorBatch[] : [];
  } catch {
    return [];
  }
}

async function writeBatches(key: string, batches: QueuedBehaviorBatch[]) {
  if (batches.length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(batches));
}

export async function enqueueBehaviorLogBatch(
  accessToken: string,
  events: BehaviorLogRequest[],
) {
  const key = await storageKey(STORAGE_PREFIX, accessToken);
  const batches = await readBatches(key);
  const batch: QueuedBehaviorBatch = {
    batchId: randomUUID(),
    events,
    queuedAt: new Date().toISOString(),
  };
  await writeBatches(key, [...batches, batch]);
  console.info(`[BehaviorPilot][1/5] QUEUED batch=${batch.batchId} events=${events.length}`);
  return batch.batchId;
}

export async function flushBehaviorLogQueue(accessToken: string) {
  const key = await storageKey(STORAGE_PREFIX, accessToken);
  const deadLetterKey = await storageKey(DEAD_LETTER_PREFIX, accessToken);
  const batches = await readBatches(key);
  const remaining = [...batches];

  while (remaining.length > 0) {
    const batch = remaining[0];
    console.info(`[BehaviorPilot][2/5] SENDING batch=${batch.batchId}`);
    try {
      const response = await recordBehaviorLogBatch(batch.batchId, batch.events, accessToken);
      const accepted = response.events.filter((event) => event.status === 'ACCEPTED').length;
      const duplicated = response.events.filter((event) => event.status === 'DUPLICATE').length;
      console.info(
        `[BehaviorPilot][3/5] STORED batch=${batch.batchId} accepted=${accepted} duplicate=${duplicated}`,
      );
      remaining.shift();
      await writeBatches(key, remaining);
    } catch (error) {
      if (error instanceof BehaviorLogApiError && error.status >= 400 && error.status < 500) {
        const deadLetters = await readBatches(deadLetterKey);
        await writeBatches(deadLetterKey, [...deadLetters, batch]);
        remaining.shift();
        await writeBatches(key, remaining);
        console.error(`[BehaviorPilot] REJECTED batch=${batch.batchId} status=${error.status}`);
        continue;
      }
      remaining[0] = {
        ...batch,
        events: batch.events.map((event) => ({
          ...event,
          metadata: { ...event.metadata, offlineQueued: true },
        })),
      };
      await writeBatches(key, remaining);
      console.warn(`[BehaviorPilot] RETRY_LATER batch=${batch.batchId}`, error);
      break;
    }
  }
}
