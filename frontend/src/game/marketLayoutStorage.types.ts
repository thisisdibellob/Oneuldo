/** A single durable snapshot. Implementations must reject if a write did not finish. */
export type MarketLayoutStorage = {
  read(): Promise<string | null>;
  write(contents: string): Promise<void>;
  /** Wrap the complete read/modify/write operation when separate app contexts share storage. */
  withExclusiveWrite?<T>(work: () => Promise<T>): Promise<T>;
};

export class MarketLayoutStorageUnavailableError extends Error {
  readonly code = 'storage-unavailable';
  constructor(message = '이 환경에서는 배치를 기기에 저장할 수 없어요. JSON으로 내보내 주세요.') {
    super(message);
    this.name = 'MarketLayoutStorageUnavailableError';
  }
}
