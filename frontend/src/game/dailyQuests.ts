export type DailyQuestId =
  | 'home-fridge'
  | 'minsu-safety'
  | 'bus-route'
  | 'market-shopping';

export type DailyQuestKind = 'automatic' | 'request';
export type DailyQuestStatus = 'available' | 'active' | 'completed';
export type DailyQuestIconKey = 'home' | 'minsu' | 'bus' | 'market';

export type DailyQuestDefinition = {
  description: string;
  discoveryHint: string;
  iconKey: DailyQuestIconKey;
  id: DailyQuestId;
  kind: DailyQuestKind;
  providerName?: string;
  region: string;
  rewardXp: number;
  title: string;
};

export type DailyQuestItem = DailyQuestDefinition & {
  status: DailyQuestStatus;
};

export type DailyQuestStatusMap = Readonly<Record<DailyQuestId, DailyQuestStatus>>;

export const DAILY_QUEST_DEFINITIONS = [
  {
    description: '냉장고에서 유통기한과 필요한 물건을 확인해요.',
    discoveryHint: '집 안 냉장고에서 바로 시작할 수 있어요.',
    iconKey: 'home',
    id: 'home-fridge',
    kind: 'automatic',
    region: '우리 집',
    rewardXp: 10,
    title: '냉장고 살펴보기',
  },
  {
    description: '민수와 함께 나에게 맞는 대중교통 안전 문제를 연습해요.',
    discoveryHint: '마을 중앙의 민수를 찾아보세요.',
    iconKey: 'minsu',
    id: 'minsu-safety',
    kind: 'request',
    providerName: '민수',
    region: '마을 중앙',
    rewardXp: 10,
    title: '대중교통 안전 연습',
  },
  {
    description: '목적지까지 가는 버스를 확인하고 안전하게 이용해요.',
    discoveryHint: '버스정류장의 기사님을 찾아보세요.',
    iconKey: 'bus',
    id: 'bus-route',
    kind: 'request',
    providerName: '기사님',
    region: '버스정류장',
    rewardXp: 20,
    title: '목적지 버스 찾기',
  },
  {
    description: '장보기 목록에 맞게 필요한 물건을 모두 준비해요.',
    discoveryHint: '하늘마트의 지영을 찾아보세요.',
    iconKey: 'market',
    id: 'market-shopping',
    kind: 'request',
    providerName: '지영',
    region: '하늘마트',
    rewardXp: 30,
    title: '장보기 목록 완성하기',
  },
] as const satisfies readonly DailyQuestDefinition[];

export const INITIAL_DAILY_QUEST_STATUS: DailyQuestStatusMap = {
  'bus-route': 'available',
  'home-fridge': 'active',
  'market-shopping': 'available',
  'minsu-safety': 'available',
};

const questDefinitionById = new Map(
  DAILY_QUEST_DEFINITIONS.map((quest) => [quest.id, quest] as const),
);

export function createDailyQuestItems(
  statuses: DailyQuestStatusMap = INITIAL_DAILY_QUEST_STATUS,
): DailyQuestItem[] {
  return DAILY_QUEST_DEFINITIONS.map((quest) => ({
    ...quest,
    status: statuses[quest.id],
  }));
}

export function acceptDailyQuest(
  statuses: DailyQuestStatusMap,
  questId: DailyQuestId,
): DailyQuestStatusMap {
  const quest = questDefinitionById.get(questId);
  if (!quest || quest.kind !== 'request' || statuses[questId] !== 'available') {
    return statuses;
  }

  return { ...statuses, [questId]: 'active' };
}

export function completeDailyQuest(
  statuses: DailyQuestStatusMap,
  questId: DailyQuestId,
): DailyQuestStatusMap {
  if (statuses[questId] !== 'active') return statuses;
  return { ...statuses, [questId]: 'completed' };
}
