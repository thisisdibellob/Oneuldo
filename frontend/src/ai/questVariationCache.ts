import type { QuestVariationResult } from './contracts';

export function createQuestVariationCacheKey(questId: string, stepId: string): string {
  return `${questId}:${stepId}`;
}

/** 한 번의 퀘스트 수행 중 같은 단계의 생성 결과를 재사용한다. */
export class QuestVariationSessionCache {
  private readonly results = new Map<string, QuestVariationResult>();
  private readonly pending = new Map<string, Promise<QuestVariationResult>>();

  get(key: string): QuestVariationResult | undefined {
    return this.results.get(key);
  }

  getOrCreate(
    key: string,
    factory: () => Promise<QuestVariationResult>,
  ): Promise<QuestVariationResult> {
    const cached = this.results.get(key);
    if (cached) return Promise.resolve(cached);

    const existing = this.pending.get(key);
    if (existing) return existing;

    const request = factory()
      .then((result) => {
        this.results.set(key, result);
        return result;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  clear(): void {
    this.results.clear();
    this.pending.clear();
  }
}
