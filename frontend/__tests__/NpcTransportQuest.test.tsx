import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useNpcTransportQuest } from '../src/game/useNpcTransportQuest';
import {
  completeQuestSession,
  getQuestDetail,
  getRecommendedQuests,
  startQuestSession,
} from '../src/api/quest';
import { queueQuestEvent } from '../src/api/questEventQueue';

jest.mock('../src/api/quest', () => ({
  abandonQuestSession: jest.fn(async () => ({ status: 'ABANDONED' })),
  completeQuestSession: jest.fn(async () => ({ status: 'COMPLETED' })),
  getQuestDetail: jest.fn(async () => ({
    categoryCode: 'PUBLIC_TRANSPORT',
    categoryName: '대중교통',
    code: 'BUS_TEST',
    difficulty: 'EASY',
    goal: '버스 번호를 확인한다.',
    id: 'transport-quest',
    rewardPoints: 20,
    steps: [{
      choices: [
        { choiceOrder: 1, correct: true, feedback: '잘했어요.', id: 'correct', label: '번호를 확인해요.' },
        { choiceOrder: 2, correct: false, feedback: '다시 확인해요.', id: 'wrong', label: '아무 버스나 타요.' },
      ],
      hint: null,
      id: 'step-1',
      instruction: '버스 번호를 찾아보세요.',
      situation: '버스가 정류장에 들어와요.',
      stepOrder: 1,
    }],
    summary: '버스 번호 확인',
    title: '버스 번호 찾기',
  })),
  getQuests: jest.fn(async () => []),
  getRecommendedQuests: jest.fn(async () => [{
    categoryCode: 'PUBLIC_TRANSPORT',
    categoryName: '대중교통',
    difficulty: 'EASY',
    id: 'transport-quest',
    rewardPoints: 20,
    summary: '버스 번호 확인',
    title: '버스 번호 찾기',
  }]),
  startQuestSession: jest.fn(async () => ({ id: 'session-1', status: 'IN_PROGRESS' })),
}));

jest.mock('../src/api/questEventQueue', () => ({
  flushQuestEventQueue: jest.fn(async () => undefined),
  getQueuedQuestEventCount: jest.fn(() => 0),
  queueQuestEvent: jest.fn(),
}));

jest.mock('../src/ai/questGenerationStore', () => ({
  evictQuestGenerationSnapshot: jest.fn(),
  warmFullQuest: jest.fn(async (quest) => ({
    failures: [null],
    quest,
    questId: quest.id,
    sources: ['ai'],
    state: 'ready',
  })),
}));

function Harness({ onCompleted }: { onCompleted: () => void }) {
  const practice = useNpcTransportQuest({ accessToken: 'token', onCompleted });
  return (
    <View>
      <Text>{practice.stage}</Text>
      <Text>{practice.contentSource}</Text>
      <Text>{practice.step?.instruction ?? ''}</Text>
      <Text>{practice.submittedChoice?.feedback ?? ''}</Text>
      <Pressable accessibilityRole="button" onPress={() => void practice.open()}>
        <Text>열기</Text>
      </Pressable>
      {practice.step?.choices.map((choice) => (
        <Pressable key={choice.id} onPress={() => practice.selectChoice(choice.id)}>
          <Text>{choice.label}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={practice.advance}>
        <Text>다음</Text>
      </Pressable>
    </View>
  );
}

describe('NPC 대중교통 퀘스트', () => {
  beforeEach(() => jest.clearAllMocks());

  it('추천 퀘스트로 세션을 만들고 오답·정답 시도와 완료를 기록한다', async () => {
    const onCompleted = jest.fn();
    const screen = render(<Harness onCompleted={onCompleted} />);

    fireEvent.press(screen.getByText('열기'));
    await waitFor(() => expect(screen.getByText('버스 번호를 찾아보세요.')).toBeTruthy());
    expect(screen.getByText('ai')).toBeTruthy();
    expect(getRecommendedQuests).toHaveBeenCalledWith('token');
    expect(getQuestDetail).toHaveBeenCalledWith('transport-quest');
    expect(startQuestSession).toHaveBeenCalledWith('transport-quest', 'token');

    fireEvent.press(screen.getByText('아무 버스나 타요.'));
    expect(screen.getByText('다시 확인해요.')).toBeTruthy();
    fireEvent.press(screen.getByText('번호를 확인해요.'));
    expect(screen.getByText('잘했어요.')).toBeTruthy();

    expect(queueQuestEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      request: expect.objectContaining({ attemptNumber: 1, choiceId: 'wrong', stepId: 'step-1' }),
      sessionId: 'session-1',
    }));
    expect(queueQuestEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      request: expect.objectContaining({ attemptNumber: 2, choiceId: 'correct', stepId: 'step-1' }),
      sessionId: 'session-1',
    }));

    fireEvent.press(screen.getByText('다음'));
    expect(onCompleted).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(completeQuestSession).toHaveBeenCalledWith('session-1', 'token'));
  });
});
