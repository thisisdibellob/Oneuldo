process.env.EXPO_PUBLIC_API_URL = 'http://test-server';
jest.mock('../src/game/scenarios', () => ({ resolveMarketAiMission: (quest: unknown) => quest }));
const { getMarketAiQuest } = require('../src/api/marketPersonalization') as typeof import('../src/api/marketPersonalization');

describe('장보기 재진입 요청 공유', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('같은 토큰의 진행 요청을 공유하고 완료 후 메모리에서 해제한다', async () => {
    let finish!: (response: unknown) => void;
    const fetchMock = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    global.fetch = fetchMock;
    const first = getMarketAiQuest('account-a');
    const second = getMarketAiQuest('account-a');
    const third = getMarketAiQuest('account-a');
    expect(second).toBe(first); expect(third).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish({ ok: true, json: async () => ({ generationId: 'G1', quest: {} }) });
    expect((await second).generationId).toBe('G1');
    await first;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ generationId: 'G1', quest: {} }) });
    await getMarketAiQuest('account-a');
    expect(fetchMock).toHaveBeenCalledTimes(2); // Server checks new logs and persistent reuse.
  });

  it('계정 간 요청은 합치지 않으며 실패 후 다시 요청할 수 있다', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const a = getMarketAiQuest('account-a'); const b = getMarketAiQuest('account-b');
    expect(a).not.toBe(b);
    await expect(a).rejects.toThrow('503'); await expect(b).rejects.toThrow('503');
    await expect(getMarketAiQuest('account-a')).rejects.toThrow('503');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
