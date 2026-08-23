import type { QuestDetail, QuestStep } from '../../api/quest';

export const KOREAN_TRANSPORT_RULE_VERSION = 'kr-public-transport-2026-08-23';

const commonRules = [
  '노선·행선지·진행 방향을 공식 안내판이나 화면으로 확인한다.',
  '승하차할 때 뛰거나 밀지 않고 완전히 멈춘 뒤 차례로 이동한다.',
  '지역마다 다른 요금·시간·설비를 전국 공통 사실처럼 만들지 않는다.',
];

const modeRules = {
  BUS: [
    '버스 번호와 행선지·운행 방향을 함께 확인한다.',
    '차도에서 떨어져 기다리고 떠나는 버스를 따라 뛰지 않는다.',
    '교통카드는 교통카드 단말기에 대고 오류가 나면 기사에게 알린다.',
    '목적지 바로 전 정류장 무렵 하차 버튼을 누르고 정차한 뒤 내린다.',
    '일반 시내·마을버스에 안전벨트가 반드시 있다고 만들지 않는다.',
  ],
  SUBWAY: [
    '노선 색상·번호와 역 이름, 행선지·방면을 함께 확인한다.',
    '승강장 안전선 안쪽에서 기다린다.',
    '내리는 승객이 먼저 지나간 뒤 열차와 승강장 사이의 틈을 살피며 탄다.',
    '환승 노선과 방면 표지를 따라 이동한다.',
    '길을 잃거나 비상 상황이면 선로에 내려가지 말고 역 직원에게 도움을 요청한다.',
  ],
} as const;

type QuestPromptInput = Pick<QuestDetail, 'title' | 'goal' | 'difficulty'>
  & Partial<Pick<QuestDetail, 'code' | 'summary'>>;

export function buildKoreanTransportRulePrompt(quest: QuestPromptInput, step: QuestStep): string {
  const searchable = [
    quest.code,
    quest.title,
    quest.summary,
    quest.goal,
    step.situation,
    step.instruction,
    step.hint,
  ].filter(Boolean).join(' ').toUpperCase();
  const subway = ['SUBWAY', 'METRO', '지하철', '전철', '개찰구', '승강장', '역무원']
    .some((keyword) => searchable.includes(keyword));
  const mode = subway ? 'SUBWAY' : 'BUS';
  return [
    `한국 대중교통 규칙 버전: ${KOREAN_TRANSPORT_RULE_VERSION}`,
    `교통수단: ${subway ? '지하철' : '버스'}`,
    ...commonRules.map((rule) => `- ${rule}`),
    ...modeRules[mode].map((rule) => `- ${rule}`),
    '- 위 규칙과 원문에 없는 요금·노선 번호·시간·법률·설비를 만들지 않는다.',
  ].join('\n');
}
