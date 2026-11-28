import { MarketLayoutStorageUnavailableError, type MarketLayoutStorage } from './marketLayoutStorage.types';

// Metro resolves the web/native implementation. Unknown runtimes never pretend to persist.
export const marketLayoutStorage: MarketLayoutStorage = {
  async read() { throw new MarketLayoutStorageUnavailableError(); },
  async write() { throw new MarketLayoutStorageUnavailableError(); },
};
