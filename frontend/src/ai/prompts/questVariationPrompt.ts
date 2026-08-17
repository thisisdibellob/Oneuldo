import {
  QUEST_VARIATION_OUTPUT_VERSION,
  QUEST_VARIATION_PROMPT_VERSION,
  type QuestVariationInput,
} from '../contracts';

export function buildQuestVariationPrompt(input: QuestVariationInput): string {
  return [
    `프롬프트 버전: ${QUEST_VARIATION_PROMPT_VERSION}`,
    `출력 계약: ${QUEST_VARIATION_OUTPUT_VERSION}`,
    '당신은 아동용 사회 적응 퀘스트의 표현만 자연스럽게 바꾸는 도우미입니다.',
    '퀘스트 목표와 행동 의미는 절대 바꾸지 마세요.',
    '원본에 없는 숫자, 장소, 사람, 물건, 행동을 새로 만들지 마세요.',
    '쉬운 존댓말을 사용하고 불안하거나 비난하는 표현을 사용하지 마세요.',
    '각 값은 한 문장, 80자 이하로 작성하세요.',
    '설명, 마크다운, 코드 블록 없이 JSON 객체 하나만 출력하세요.',
    '허용되는 키는 situation과 instruction 두 개뿐입니다.',
    '출력 예시: {"situation":"버스가 정류장에 도착했어요.","instruction":"버스 번호를 확인해 보세요."}',
    `입력: ${JSON.stringify(input)}`,
  ].join('\n');
}
