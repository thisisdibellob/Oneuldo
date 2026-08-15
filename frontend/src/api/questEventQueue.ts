import { QuestApiError, QuestEventRequest, recordQuestEvent } from './quest';

type QueuedQuestEvent = {
  accessToken: string;
  request: QuestEventRequest;
  sessionId: string;
};

// 앱이 열려 있는 동안 네트워크 실패 이벤트를 임시 보관한다.
const queue: QueuedQuestEvent[] = [];

export function queueQuestEvent(event: QueuedQuestEvent) {
  const duplicated = queue.some(
    (item) => item.sessionId === event.sessionId
      && item.request.stepId === event.request.stepId
      && item.request.attemptNumber === event.request.attemptNumber,
  );
  if (!duplicated) queue.push(event);
}

export async function flushQuestEventQueue() {
  while (queue.length > 0) {
    const event = queue[0];
    try {
      await recordQuestEvent(event.sessionId, event.request, event.accessToken);
      queue.shift();
    } catch (error) {
      if (error instanceof QuestApiError) {
        // 서버가 거부한 잘못된 이벤트가 뒤의 정상 이벤트를 막지 않게 한다.
        queue.shift();
      } else {
        // 연결이 돌아오면 다음 사용자 행동에서 다시 시도한다.
        break;
      }
    }
  }
}

export function getQueuedQuestEventCount() {
  return queue.length;
}
