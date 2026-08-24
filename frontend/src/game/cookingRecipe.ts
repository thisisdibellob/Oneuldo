export type CookingStageId =
  | 'ingredients'
  | 'peel'
  | 'split'
  | 'yogurt'
  | 'topping'
  | 'mix';

export type CookingStageDefinition = {
  accessibilityInstruction: string;
  hint: string;
  id: CookingStageId;
  instruction: string;
  shortLabel: string;
  targetCount: number;
  title: string;
};

export type NoCookRecipeDefinition = {
  allergens: readonly string[];
  durationMinutes: number;
  id: string;
  ingredients: readonly {
    amount: string;
    id: 'banana' | 'cereal' | 'yogurt';
    name: string;
    optional?: boolean;
    storage: 'cool' | 'room';
  }[];
  name: string;
  safetySummary: readonly string[];
  stages: readonly CookingStageDefinition[];
  usesHeat: boolean;
  usesKnife: boolean;
};

export const BANANA_YOGURT_CUP_RECIPE: NoCookRecipeDefinition = {
  allergens: ['우유', '밀·곡물(시리얼 제품에 따라 다름)'],
  durationMinutes: 5,
  id: 'banana-yogurt-cup',
  ingredients: [
    { amount: '1개', id: 'banana', name: '바나나', storage: 'room' },
    { amount: '100g', id: 'yogurt', name: '요거트', storage: 'cool' },
    { amount: '2큰술', id: 'cereal', name: '시리얼', optional: true, storage: 'room' },
  ],
  name: '바나나 요거트 컵',
  safetySummary: [
    '요리 전 손과 바나나를 흐르는 물로 씻어요.',
    '요거트와 시리얼의 알레르기 표시를 먼저 확인해요.',
    '등록된 삼킴·감각 정보에 맞지 않는 토핑은 넣지 않아요.',
  ],
  stages: [
    {
      accessibilityInstruction:
        '바나나와 요거트를 하나씩 잡아 위쪽 준비 바구니로 끌어 놓으세요. 시리얼은 선택 재료입니다.',
      hint: '바나나와 요거트를 위쪽 바구니로 옮겨요. 시리얼은 안전 정보가 맞을 때만 골라요.',
      id: 'ingredients',
      instruction: '재료를 잡아 준비 바구니에 넣어요.',
      shortLabel: '재료',
      targetCount: 2,
      title: '재료 준비하기',
    },
    {
      accessibilityInstruction: '바나나 껍질을 잡아 아래로 세 번 길게 당기세요.',
      hint: '껍질 손잡이를 잡고 아래쪽 화살표 방향으로 끝까지 내려요.',
      id: 'peel',
      instruction: '껍질을 잡고 아래로 당겨요.',
      shortLabel: '껍질',
      targetCount: 3,
      title: '껍질 벗기기',
    },
    {
      accessibilityInstruction: '바나나 조각 여섯 개를 하나씩 잡아 오른쪽 그릇으로 옮기세요.',
      hint: '왼쪽 바나나 조각을 하나씩 잡고 오른쪽 그릇까지 여섯 번 끌어 놓아요.',
      id: 'split',
      instruction: '한입 크기 조각을 그릇에 옮겨요.',
      shortLabel: '나누기',
      targetCount: 6,
      title: '바나나 나누기',
    },
    {
      accessibilityInstruction: '요거트 컵을 잡아 오른쪽 그릇으로 네 번 옮기세요.',
      hint: '파란 요거트 컵을 잡고 오른쪽 그릇까지 네 숟갈을 차례로 옮겨요.',
      id: 'yogurt',
      instruction: '요거트를 4숟갈 담아요.',
      shortLabel: '요거트',
      targetCount: 4,
      title: '요거트 담기',
    },
    {
      accessibilityInstruction:
        '안전 정보가 맞으면 시리얼 상자를 잡아 오른쪽 그릇으로 네 번 옮기세요. 넣지 않아도 계속할 수 있습니다.',
      hint: '토핑은 선택 재료예요. 안전 정보가 맞지 않거나 원하지 않으면 넣지 않아도 돼요.',
      id: 'topping',
      instruction: '토핑을 넣을지 선택해요.',
      shortLabel: '토핑',
      targetCount: 4,
      title: '토핑 선택하기',
    },
    {
      accessibilityInstruction: '숟가락을 잡고 그릇 안에서 원을 세 바퀴 그리며 천천히 섞으세요.',
      hint: '숟가락을 잡은 채 그릇 가장자리를 따라 둥글게 세 바퀴 움직여요.',
      id: 'mix',
      instruction: '숟가락을 잡고 원을 그리며 섞어요.',
      shortLabel: '섞기',
      targetCount: 3,
      title: '완성하기',
    },
  ],
  usesHeat: false,
  usesKnife: false,
};
