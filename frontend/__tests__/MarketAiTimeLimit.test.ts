process.env.EXPO_PUBLIC_API_URL = 'http://test-server';
jest.mock('../src/game/scenarios', () => ({ resolveMarketAiMission: (quest: unknown) => quest }));
const { getMarketAiQuest } = require('../src/api/marketPersonalization') as typeof import('../src/api/marketPersonalization');
// Every quest now arrives as a finished job; the body under test is its result.
const ready = (result: unknown) => ({ jobId: 'job', status: 'READY', stage: 'READY', elapsedMs: 0, deadlineSeconds: 300, result });

const environmentPlan = { shelfOrder: ['fresh', 'produce', 'household', 'meal', 'drink'], rationale: '목록을 보고 이동해요.' };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test.each([undefined, null, 179, 601, 180.5, '300'])('v20 rejects invalid AI time limit %p instead of repairing it', async timeLimitSeconds => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ready({
    promptVersion: 'market-ai-quest-v20-time-limit', quest: { environmentPlan, timeLimitSeconds },
  }) });
  await expect(getMarketAiQuest('timing-contract')).rejects.toThrow(/시간 제한/);
});

test.each([180, 300, 600])('v20 accepts valid AI time limit %p', async timeLimitSeconds => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ready({
    promptVersion: 'market-ai-quest-v20-time-limit', quest: { environmentPlan, timeLimitSeconds },
  }) });
  expect((await getMarketAiQuest('timing-contract')).quest.timeLimitSeconds).toBe(timeLimitSeconds);
});

test('old API missions only fall back when missing a time limit', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ready({ promptVersion: 'market-ai-quest-v19', quest: { environmentPlan } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ready({ promptVersion: 'market-ai-quest-v19', quest: { environmentPlan, timeLimitSeconds: 1 } }) });
  expect((await getMarketAiQuest('timing-contract')).quest.timeLimitSeconds).toBe(300);
  await expect(getMarketAiQuest('timing-contract')).rejects.toThrow('정수');
});
