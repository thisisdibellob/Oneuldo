import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseMarketSessionConfig,
  type MarketSessionConfig,
} from './marketSession';

export const MARKET_TRAINING_STORAGE_KEY = 'oneuldo.market-training-library.v1';
export type SavedMarketTraining = { name: string; config: MarketSessionConfig };
type StoragePort = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
/** Full test conditions (including the layout/list), separate from completed play records. */
export function createMarketTrainingStore(storage: StoragePort = AsyncStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  const list = async (): Promise<SavedMarketTraining[]> => {
    const raw = await storage.getItem(MARKET_TRAINING_STORAGE_KEY);
    if (!raw) return [];
    if (raw.length > 2_000_000)
      throw new Error('저장한 테스트 크기를 확인해 주세요.');
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      !Array.isArray(value.tests) ||
      value.tests.length > 24
    )
      throw new Error('저장한 테스트를 읽을 수 없어요.');
    return value.tests.map((item: SavedMarketTraining) => {
      if (
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        item.name.length > 32
      )
        throw new Error('저장한 테스트 이름을 확인해 주세요.');
      return {
        name: item.name,
        config: parseMarketSessionConfig(JSON.stringify(item.config)),
      };
    });
  };
  const save = (name: string, config: MarketSessionConfig) => {
    const operation = queue.then(async () => {
      const title = name.trim();
      if (!title || title.length > 32 || /[\u0000-\u001f]/.test(title))
        throw new Error('테스트 이름을 1~32자로 적어 주세요.');
      const copy = {
        ...config,
        startedAt: '1970-01-01T00:00:00.000Z',
        provenance: { source: 'human' as const },
      };
      delete copy.sessionId;
      const normalized = parseMarketSessionConfig(JSON.stringify(copy));
      const tests = await list();
      if (tests.some((test) => test.name === title))
        throw new Error('같은 이름이 있어요. 다른 이름으로 저장해 주세요.');
      if (tests.length >= 24)
        throw new Error(
          '테스트는 24개까지 저장할 수 있어요. JSON 저장도 사용할 수 있어요.'
        );
      const next = [{ name: title, config: normalized }, ...tests];
      const raw = JSON.stringify({ version: 1, tests: next });
      if (raw.length > 2_000_000)
        throw new Error(
          '테스트 저장 공간을 초과했어요. JSON으로 내보내 주세요.'
        );
      await storage.setItem(MARKET_TRAINING_STORAGE_KEY, raw);
      return next;
    });
    queue = operation.catch(() => undefined);
    return operation;
  };
  return { list, save };
}
export const marketTrainingStore = createMarketTrainingStore();
