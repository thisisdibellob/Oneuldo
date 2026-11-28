import { createMarketTrainingStore } from '../src/game/marketTrainingStore';
import { createMarketSession } from '../src/game/marketSession';

test('named tests persist full conditions, protect existing names, and omit previous persona identity', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: jest.fn(async () => raw),
    setItem: jest.fn(async (_key: string, value: string) => {
      raw = value;
    }),
  };
  const store = createMarketTrainingStore(storage);
  const config = createMarketSession({
    sessionId: 'old-session',
    provenance: {
      source: 'synthetic',
      agentModel: 'fixture',
      personaId: 'fixture',
    },
    training: { task: 'mother-request', mapHint: true, incidents: 'crowd' },
  }).config;
  await store.save('심부름', config);
  const reopened = await createMarketTrainingStore(storage).list();
  expect(reopened[0].config).toMatchObject({
    training: { task: 'mother-request', mapHint: true, incidents: 'crowd' },
    environment: config.environment,
    objectives: config.objectives,
    provenance: { source: 'human' },
  });
  expect(reopened[0].config).not.toHaveProperty('sessionId');
  await expect(store.save('심부름', config)).rejects.toThrow(/같은 이름/);
  await store.save('힌트 없이', {
    ...config,
    training: { task: 'mother-request', mapHint: false },
  });
  expect(await store.list()).toHaveLength(2);
});
test('failed and corrupt storage never reports success or overwrites the original', async () => {
  const storage = {
    getItem: jest.fn(async () => '{broken'),
    setItem: jest.fn(),
  };
  const store = createMarketTrainingStore(storage);
  await expect(
    store.save('test', createMarketSession().config)
  ).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
  storage.getItem.mockResolvedValue('');
  storage.setItem.mockRejectedValue(new Error('denied'));
  await expect(
    store.save('test', createMarketSession().config)
  ).rejects.toThrow('denied');
});
