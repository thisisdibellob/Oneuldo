import { buildKoreanTransportRulePrompt } from '../src/ai/prompts/koreanTransportRules';
import type { QuestStep } from '../src/api/quest';

const subwayStep: QuestStep = {
  id: 'step-subway',
  stepOrder: 1,
  situation: '지하철역의 승강장에 열차가 도착했어요.',
  instruction: '내리는 사람 뒤에 타 보세요.',
  hint: '안전선 안쪽에서 기다려요.',
  choices: [],
};

describe('한국 대중교통 규칙 매핑', () => {
  it('지하철 퀘스트에는 지하철 규칙만 넣는다', () => {
    const prompt = buildKoreanTransportRulePrompt({
      code: 'BOARD_SUBWAY_SAFELY',
      title: '혼자 지하철 타기',
      summary: '지하철을 이용해요.',
      goal: '안전하게 승하차한다.',
      difficulty: 'EASY',
    }, subwayStep);

    expect(prompt).toContain('교통수단: 지하철');
    expect(prompt).toContain('열차와 승강장 사이의 틈');
    expect(prompt).not.toContain('하차 버튼');
    expect(prompt).not.toContain('안전벨트');
  });
});
