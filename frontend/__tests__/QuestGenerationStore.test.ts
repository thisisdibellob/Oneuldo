import type { QuestDetail, QuestStep } from '../src/api/quest';
import {
  clearQuestGenerationStore,
  warmFullQuest,
} from '../src/ai/questGenerationStore';
import { generateFullQuestStep } from '../src/ai/questStepGenerator';

jest.mock('../src/ai/questStepGenerator', () => ({
  generateFullQuestStep: jest.fn(),
}));

const mockedGenerateFullQuestStep = jest.mocked(generateFullQuestStep);

const steps: QuestStep[] = Array.from({ length: 4 }, (_, index) => ({
  id: `step-${index + 1}`,
  stepOrder: index + 1,
  instruction: `안내 ${index + 1}`,
  situation: `상황 ${index + 1}`,
  hint: `힌트 ${index + 1}`,
  choices: [
    {
      id: `choice-${index + 1}`,
      choiceOrder: 1,
      label: `선택 ${index + 1}`,
      correct: true,
      feedback: '맞아요.',
    },
  ],
}));

const quest: QuestDetail = {
  id: 'quest-early-stop',
  categoryCode: 'PUBLIC_TRANSPORT',
  categoryName: '대중교통',
  title: '혼자 버스 타기',
  summary: '버스를 타요.',
  difficulty: 'EASY',
  rewardPoints: 10,
  code: 'TAKE_BUS_ALONE',
  goal: '목적지까지 이동한다.',
  steps,
};

describe('퀘스트 전체 생성 조기 중단', () => {
  beforeEach(() => {
    clearQuestGenerationStore();
    mockedGenerateFullQuestStep.mockReset();
  });

  it('첫 단계가 실패하면 뒤 단계를 호출하지 않고 전체 원문을 사용한다', async () => {
    mockedGenerateFullQuestStep.mockResolvedValueOnce({
      step: steps[0],
      source: 'original',
      requestId: 'step-1-failed',
      failureCode: 'THEME_NOT_APPLIED',
    });

    const snapshot = await warmFullQuest(quest);

    expect(mockedGenerateFullQuestStep).toHaveBeenCalledTimes(1);
    expect(snapshot.quest).toBe(quest);
    expect(snapshot.sources).toEqual(['original', 'original', 'original', 'original']);
    expect(snapshot.failures).toEqual([
      'THEME_NOT_APPLIED',
      'SKIPPED_AFTER_FAILURE',
      'SKIPPED_AFTER_FAILURE',
      'SKIPPED_AFTER_FAILURE',
    ]);
  });

  it('중간 단계가 실패하면 앞선 AI 결과도 폐기하고 나머지를 건너뛴다', async () => {
    mockedGenerateFullQuestStep
      .mockResolvedValueOnce({
        step: { ...steps[0], situation: 'AI 상황 1' },
        source: 'ai',
        requestId: 'step-1-success',
        failureCode: null,
      })
      .mockResolvedValueOnce({
        step: steps[1],
        source: 'original',
        requestId: 'step-2-failed',
        failureCode: 'INVALID_OUTPUT_SHAPE',
      });

    const snapshot = await warmFullQuest(quest);

    expect(mockedGenerateFullQuestStep).toHaveBeenCalledTimes(2);
    expect(snapshot.quest).toBe(quest);
    expect(snapshot.sources).toEqual(['original', 'original', 'original', 'original']);
    expect(snapshot.failures).toEqual([
      null,
      'INVALID_OUTPUT_SHAPE',
      'SKIPPED_AFTER_FAILURE',
      'SKIPPED_AFTER_FAILURE',
    ]);
  });
});
