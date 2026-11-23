import type { MarketLayoutStorage } from './marketLayoutStorage.types';

export type MarketLayoutFileIO = {
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, contents: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
};
const snapshotPattern = /^snapshot-(\d{16})\.json$/;
function snapshots(names: string[]) { return names.filter(name => snapshotPattern.test(name)).sort(); }

/**
 * Commit a fully written temporary file to a new filename. Expo's overwrite move first
 * deletes its destination, so replacing the previous snapshot in place can lose data.
 */
export function createFileMarketLayoutStorage(io: MarketLayoutFileIO): MarketLayoutStorage {
  return {
    async read() {
      const names = snapshots(await io.list());
      return names.length ? io.read(names[names.length - 1]) : null;
    },
    async write(contents) {
      const previous = snapshots(await io.list());
      const revision = previous.length ? Number(snapshotPattern.exec(previous[previous.length - 1])![1]) + 1 : 1;
      if (!Number.isSafeInteger(revision)) throw new Error('Snapshot revision overflow');
      const target = `snapshot-${String(revision).padStart(16, '0')}.json`;
      const staging = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.tmp`;
      try {
        await io.write(staging, contents);
        if (await io.read(staging) !== contents) throw new Error('Incomplete snapshot write');
        // Destination is new; a failure leaves the last committed snapshot untouched.
        await io.move(staging, target);
      } catch (error) {
        try { await io.remove(staging); } catch { /* A leftover temporary file is ignored on read. */ }
        throw error;
      }
      // Keep the previous committed version as a backup. Never report a successful commit
      // as a failure just because cleanup is unavailable; future saves can retry cleanup.
      for (const name of previous.slice(0, -1)) {
        try { await io.remove(name); } catch { /* The committed snapshot is already durable. */ }
      }
    },
  };
}
