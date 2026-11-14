process.env.EXPO_PUBLIC_API_URL = 'http://test-server';
jest.mock('../src/game/scenarios', () => ({ resolveMarketAiMission: (quest: unknown) => quest }));
const { getMarketAiQuest, MarketQuestReadinessError } = require('../src/api/marketPersonalization') as typeof import('../src/api/marketPersonalization');
const { createMarketEnvironment } = require('../src/game/marketEnvironment') as typeof import('../src/game/marketEnvironment');
const { getMarketEnvironmentContext } = require('../src/game/marketEnvironmentPlan') as typeof import('../src/game/marketEnvironmentPlan');

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

  it.each([
    ['LATEST_PLAY_PROFILE_PENDING', 409, true, 'PROFILE'],
    ['LATEST_PLAY_PROFILE_FAILED', 503, false, 'FAILED'],
  ])('최신 플레이 상태 %s를 일반 서버 오류와 구분한다', async (code, status, pending, stage) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status,
      json: async () => ({ code, stage, message: '분석 탭에서 확인해 주세요.' }) });
    const error = await getMarketAiQuest('freshness-account').catch(value => value);
    expect(error).toBeInstanceOf(MarketQuestReadinessError);
    expect(error.pending).toBe(pending);
    expect(error.stage).toBe(stage);
    expect(error.message).toBe('분석 탭에서 확인해 주세요.');
    // A readiness response must not remain in the single-flight cache after it is settled.
    await expect(getMarketAiQuest('freshness-account')).rejects.toBeInstanceOf(MarketQuestReadinessError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('진행 상태 뒤 프로필 반영이 완료되면 재요청에서 실제 AI 과제를 받는다', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 'LATEST_PLAY_PROFILE_PENDING', stage: 'PROFILE' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ generationId: 'new-profile-quest', quest: {} }) });
    await expect(getMarketAiQuest('recovered-account')).rejects.toBeInstanceOf(MarketQuestReadinessError);
    expect((await getMarketAiQuest('recovered-account')).generationId).toBe('new-profile-quest');
  });

  it('같은 계정과 실제 배치는 요청을 공유하고 다른 배치는 공유하지 않는다', async () => {
    const context = getMarketEnvironmentContext(createMarketEnvironment({ seed: 'context', layoutId: 'classic' }));
    const changed = getMarketEnvironmentContext(createMarketEnvironment({ seed: 'context', layoutId: 'corner' }));
    const finishes: Array<(value: unknown) => void> = [];
    global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
    const first = getMarketAiQuest('context-account', context);
    const same = getMarketAiQuest('context-account', JSON.parse(JSON.stringify(context)));
    const otherLayout = getMarketAiQuest('context-account', changed);
    const preserve = getMarketAiQuest('context-account', { ...context, preserveShelfOrder: true });
    expect(same).toBe(first); expect(otherLayout).not.toBe(first);
    expect(preserve).not.toBe(first);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const request = jest.mocked(global.fetch).mock.calls[0][1]!;
    expect(JSON.parse(request.body as string)).toEqual({ environmentContext: context });
    expect(request.headers).toMatchObject({ 'Content-Type': 'application/json' });
    finishes.forEach(finish => finish({ ok: true, json: async () => ({ generationId: 'context', quest: {} }) }));
    await Promise.all([first, same, otherLayout, preserve]);
  });

  it('새 AI 생성의 null·누락 계획을 거부하고 예전 저장 응답은 호환한다', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ promptVersion: 'market-ai-quest-v18-ai-shelf-plan', quest: {} }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ promptVersion: 'market-ai-quest-v18-ai-shelf-plan', quest: { environmentPlan: null } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ promptVersion: 'market-ai-quest-v17', generationId: 'legacy', quest: { environmentPlan: null } }) });
    await expect(getMarketAiQuest('new-plan')).rejects.toThrow('추천이 빠져');
    await expect(getMarketAiQuest('new-plan')).rejects.toThrow('추천이 빠져');
    expect((await getMarketAiQuest('new-plan')).generationId).toBe('legacy');
  });

  it('수동 순서 유지 요청에서 다른 순서의 AI 안내를 실행하지 않고 원래 모델 계획을 보존한다', async () => {
    const context = getMarketEnvironmentContext(createMarketEnvironment({ seed: 'preserve-layout' }), true);
    const order = context.shelfSlots.map(slot => slot.categoryId);
    const accepted = { shelfOrder: order, rationale: '직접 선택한 매대에서 목록의 분류를 찾아가요.' };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ promptVersion: 'market-ai-quest-v18-ai-shelf-plan', quest: {
        environmentPlan: { ...accepted, shelfOrder: [...order].reverse() },
      } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ promptVersion: 'market-ai-quest-v18-ai-shelf-plan', quest: { environmentPlan: accepted } }) });
    await expect(getMarketAiQuest('manual-account', context)).rejects.toThrow('직접 설정한 진열대 순서');
    expect((await getMarketAiQuest('manual-account', context)).quest.environmentPlan).toEqual(accepted);
    expect(JSON.parse(jest.mocked(global.fetch).mock.calls[1][1]!.body as string).environmentContext.preserveShelfOrder).toBe(true);
  });
});
