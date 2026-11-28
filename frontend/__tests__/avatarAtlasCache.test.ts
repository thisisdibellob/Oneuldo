import type { ImageSourcePropType } from 'react-native';
import { AVATAR_ATLAS_LOAD_TIMEOUT_MS, AVATAR_ATLAS_RETRY_DELAY_MS, createAvatarAtlasCache } from '../src/game/avatarAtlasCache';

const deferred = () => {
  let resolve!: (source: ImageSourcePropType) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ImageSourcePropType>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('shared atlas file loading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('downloads a sheet once across simultaneous callers and later map mounts', async () => {
    const pending = deferred();
    const download = jest.fn(() => pending.promise);
    const cache = createAvatarAtlasCache(download);
    const first = jest.fn(), second = jest.fn(), later = jest.fn();
    const leave = cache.subscribe(1, first);
    cache.subscribe(1, second);
    await flush();
    expect(download).toHaveBeenCalledTimes(1);
    leave();
    pending.resolve({ uri: 'file://cached-sheet.png' });
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ status: 'ready', source: { uri: 'file://cached-sheet.png' } });
    cache.subscribe(1, later);
    expect(later).toHaveBeenCalledWith(second.mock.calls[0][0]);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('caps real downloads at two, skips abandoned queued directions and prioritizes the current direction', async () => {
    const requests = Array.from({ length: 5 }, deferred);
    const download = jest.fn((source: ImageSourcePropType) => requests[Number(source) - 1].promise);
    const cache = createAvatarAtlasCache(download);
    cache.subscribe(1, jest.fn()); cache.subscribe(2, jest.fn());
    const abandoned = cache.subscribe(3, jest.fn());
    cache.subscribe(4, jest.fn()); cache.subscribe(5, jest.fn());
    abandoned();
    await flush();
    expect(download.mock.calls.map(call => call[0])).toEqual([1, 2]);
    requests[0].resolve({ uri: 'one' }); await flush();
    expect(download.mock.calls.map(call => call[0])).toEqual([1, 2, 5]);
    requests[1].resolve({ uri: 'two' }); await flush();
    expect(download.mock.calls.map(call => call[0])).toEqual([1, 2, 5, 4]);
    requests[4].resolve({ uri: 'five' }); requests[3].resolve({ uri: 'four' }); await flush();
    expect(download.mock.calls.map(call => call[0])).not.toContain(3);
  });

  it('reports timeout without opening unlimited network slots and recovers when the real download settles', async () => {
    const requests = [deferred(), deferred(), deferred()];
    const download = jest.fn((source: ImageSourcePropType) => requests[Number(source) - 1].promise);
    const cache = createAvatarAtlasCache(download), first = jest.fn();
    cache.subscribe(1, first); cache.subscribe(2, jest.fn()); cache.subscribe(3, jest.fn());
    await flush();
    jest.advanceTimersByTime(AVATAR_ATLAS_LOAD_TIMEOUT_MS);
    await flush();
    expect(first).toHaveBeenLastCalledWith({ status: 'timeout' });
    expect(download).toHaveBeenCalledTimes(2);
    requests[0].resolve({ uri: 'late-but-valid' }); await flush();
    expect(first).toHaveBeenLastCalledWith({ status: 'ready', source: { uri: 'late-but-valid' } });
    expect(download).toHaveBeenCalledTimes(3);
  });

  it('serves a newly requested direction ahead of background warmup without adding network slots', async () => {
    const requests = [deferred(), deferred(), deferred(), deferred()];
    const download = jest.fn((source: ImageSourcePropType) => requests[Number(source) - 1].promise);
    const cache = createAvatarAtlasCache(download);
    cache.subscribe(1, jest.fn()); cache.subscribe(2, jest.fn());
    cache.subscribe(3, jest.fn(), 'background');
    cache.subscribe(4, jest.fn());
    await flush(); expect(download.mock.calls.map(call => call[0])).toEqual([1, 2]);
    requests[0].resolve({ uri: 'one' }); await flush();
    expect(download.mock.calls.map(call => call[0])).toEqual([1, 2, 4]);
  });

  it('retries a real failure once after its cooldown without a render-driven request loop', async () => {
    const download = jest.fn().mockRejectedValue(new Error('offline'));
    const cache = createAvatarAtlasCache(download), result = jest.fn();
    cache.subscribe(1, result); await flush();
    expect(result).toHaveBeenLastCalledWith({ status: 'failed' });
    cache.subscribe(1, jest.fn()); await flush();
    expect(download).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(AVATAR_ATLAS_RETRY_DELAY_MS);
    cache.subscribe(1, jest.fn()); await flush();
    expect(download).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(AVATAR_ATLAS_RETRY_DELAY_MS);
    cache.subscribe(1, jest.fn()); await flush();
    expect(download).toHaveBeenCalledTimes(2);
  });
});
