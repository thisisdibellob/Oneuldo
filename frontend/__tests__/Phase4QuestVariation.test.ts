import type { QuestDetail } from '../src/api/quest';
import type { QuestVariationResult } from '../src/ai/contracts';
import {
  createQuestVariationCacheKey,
  QuestVariationSessionCache,
} from '../src/ai/questVariationCache';
import { isQuestVariationTarget } from '../src/ai/useQuestVariation';

const busQuest = {
  categoryCode: 'PUBLIC_TRANSPORT',
  code: 'TAKE_BUS_ALONE',
  id: 'quest-1',
} as QuestDetail;

const result = {
  metadata: {
    failureCode: null,
    fallbackUsed: false,
    latencyMs: 120,
    modelVersion: 'llama.cpp-test',
    policyVersion: 'quest-variation-policy-v1',
    promptVersion: 'quest-variation-prompt-v1',
    requestId: 'phase4-test-1',
  },
  source: 'ai',
  step: { id: 'step-1' },
  variation: { instruction: '새 안내', situation: '새 상황' },
} as QuestVariationResult;

describe('Phase 4 퀘스트 화면 연결', () => {
  it('대중교통 트랙의 모든 난이도 견본에 변형을 적용한다', () => {
    expect(isQuestVariationTarget(busQuest)).toBe(true);
    expect(isQuestVariationTarget({ ...busQuest, code: 'TRANSFER_TO_ANOTHER_BUS' })).toBe(true);
    expect(isQuestVariationTarget({ ...busQuest, categoryCode: 'DAILY_LIFE', code: 'ORDER_AT_CAFE' })).toBe(false);
    expect(isQuestVariationTarget(null)).toBe(false);
  });

  it('퀘스트와 단계가 같을 때 같은 캐시 키를 만든다', () => {
    expect(createQuestVariationCacheKey('quest-1', 'step-1')).toBe('quest-1:step-1');
  });

  it('같은 세션·단계의 동시 요청을 한 번만 실행한다', async () => {
    const cache = new QuestVariationSessionCache();
    const factory = jest.fn(async () => result);
    const key = createQuestVariationCacheKey('quest-1', 'step-1');

    const [first, second] = await Promise.all([
      cache.getOrCreate(key, factory),
      cache.getOrCreate(key, factory),
    ]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first).toBe(result);
    expect(second).toBe(result);
    expect(cache.get(key)).toBe(result);
  });

  it('세션 캐시를 비우면 다음 요청에서 다시 생성한다', async () => {
    const cache = new QuestVariationSessionCache();
    const factory = jest.fn(async () => result);
    const key = createQuestVariationCacheKey('quest-1', 'step-1');

    await cache.getOrCreate(key, factory);
    cache.clear();
    await cache.getOrCreate(key, factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
