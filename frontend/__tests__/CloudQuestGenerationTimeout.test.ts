const originalFetch = global.fetch;
const originalTimeout = process.env.EXPO_PUBLIC_AI_TIMEOUT_MS;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalTimeout === undefined) delete process.env.EXPO_PUBLIC_AI_TIMEOUT_MS;
  else process.env.EXPO_PUBLIC_AI_TIMEOUT_MS = originalTimeout;
  jest.useRealTimers();
  jest.resetModules();
});

test.each([
  ['1800000', 1_800_000],
  ['invalid', 25_000],
  ['-1', 25_000],
])('AI timeout %s aborts at %i ms', async (setting, expectedMs) => {
  jest.useFakeTimers();
  process.env.EXPO_PUBLIC_AI_TIMEOUT_MS = setting;
  const { generateCloudQuestText } = require('../src/api/cloudQuestGeneration');
  let signal: AbortSignal | undefined;
  global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    signal = options?.signal as AbortSignal;
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  })) as jest.Mock;
  const pending = generateCloudQuestText('token', {
    questId: 'quest', stepId: 'step', requestId: 'request', incidentType: 'incident',
  });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'CLOUD_AI_TIMEOUT' });
  jest.advanceTimersByTime(expectedMs - 1);
  expect(signal?.aborted).toBe(false);
  jest.advanceTimersByTime(1);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
