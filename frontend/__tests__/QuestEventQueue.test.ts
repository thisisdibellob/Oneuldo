import { flushQuestEventQueue, getQueuedQuestEventCount, queueQuestEvent } from '../src/api/questEventQueue';
import { recordQuestEvent } from '../src/api/quest';

jest.mock('../src/api/quest', () => ({
  QuestApiError: class QuestApiError extends Error {},
  recordQuestEvent: jest.fn(),
}));

const mockedRecordQuestEvent = jest.mocked(recordQuestEvent);

it('네트워크 실패 이벤트를 순서대로 보관했다가 다시 전송한다', async () => {
  mockedRecordQuestEvent
    .mockRejectedValueOnce(new TypeError('network error'))
    .mockResolvedValue({
      attemptNumber: 1,
      completedSteps: 0,
      correct: false,
      eventId: 1,
      feedback: '다시 확인해요.',
      totalSteps: 1,
    });

  queueQuestEvent({
    accessToken: 'token',
    request: { attemptNumber: 1, choiceId: 'choice-1', hintUsed: false, responseTimeMs: 100, stepId: 'step-1' },
    sessionId: 'session-1',
  });
  queueQuestEvent({
    accessToken: 'token',
    request: { attemptNumber: 2, choiceId: 'choice-2', hintUsed: true, responseTimeMs: 200, stepId: 'step-1' },
    sessionId: 'session-1',
  });

  await flushQuestEventQueue();
  expect(getQueuedQuestEventCount()).toBe(2);

  await flushQuestEventQueue();
  expect(getQueuedQuestEventCount()).toBe(0);
  expect(mockedRecordQuestEvent.mock.calls.map((call) => call[1].attemptNumber)).toEqual([1, 1, 2]);
});
