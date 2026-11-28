import { MarketLayoutStorageUnavailableError, type MarketLayoutStorage } from './marketLayoutStorage.types';

export const MARKET_LAYOUT_STORAGE_KEY = 'oneuldo.market-layout-library.v1';
export type MarketLayoutLockManager = {
  request<T>(name: string, work: () => Promise<T>): Promise<T>;
};
export function createBrowserMarketLayoutStorage(
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'> | undefined = () => globalThis.localStorage,
  getLocks: () => MarketLayoutLockManager | undefined = () => globalThis.navigator?.locks,
): MarketLayoutStorage {
  function storage() {
    const target = getStorage();
    if (!target) throw new MarketLayoutStorageUnavailableError();
    return target;
  }
  return {
    async read() { return storage().getItem(MARKET_LAYOUT_STORAGE_KEY); },
    async write(contents) { storage().setItem(MARKET_LAYOUT_STORAGE_KEY, contents); },
    async withExclusiveWrite<T>(work: () => Promise<T>): Promise<T> {
      const locks = getLocks();
      if (!locks) {
        throw new MarketLayoutStorageUnavailableError('이 브라우저에서는 안전하게 저장할 수 없어요. 최신 브라우저에서 HTTPS 주소로 열거나, JSON으로 내보내 주세요.');
      }
      // Web Locks spans tabs/windows of this origin, unlike a per-store Promise queue.
      return locks.request(MARKET_LAYOUT_STORAGE_KEY, work);
    },
  };
}
export const marketLayoutStorage = createBrowserMarketLayoutStorage();
