export type CookingStageId =
  | 'ingredients'
  | 'peel'
  | 'split'
  | 'yogurt'
  | 'topping'
  | 'mix'
  | 'plate'
  | 'cleanup';

export type CookingStageDefinition = {
  accessibilityInstruction: string;
  hint: string;
  hints: readonly [string, string, string];
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
        '그릇과 숟가락을 고른 뒤 바나나와 요거트를 하나씩 잡아 위쪽 준비 바구니로 끌어 놓으세요. 시리얼은 선택 재료입니다.',
      hint: '그릇과 숟가락을 고르고 바나나와 요거트를 위쪽 바구니로 옮겨요.',
      hints: [
        '불과 칼은 쓰지 않아요. 담을 그릇과 섞을 숟가락을 먼저 찾아요.',
        '필요한 재료는 두 가지예요. 노란 바나나와 파란 요거트를 바구니로 끌어요.',
        '그릇, 숟가락, 바나나, 요거트가 모두 준비되면 다음으로 갈 수 있어요.',
      ],
      id: 'ingredients',
      instruction: '쓸 도구를 고르고 재료를 준비해요.',
      shortLabel: '재료',
      targetCount: 4,
      title: '도구와 재료 준비하기',
    },
    {
      accessibilityInstruction: '바나나 껍질을 잡아 아래로 세 번 길게 당기세요.',
      hint: '껍질 손잡이를 잡고 아래쪽 화살표 방향으로 끝까지 내려요.',
      hints: [
        '바나나 아래에 있는 손잡이를 찾아요.',
        '손잡이를 누른 채 아래쪽으로 길게 당겨요.',
        '짧게 놓지 말고 화살표 끝까지 세 번 당겨 보세요.',
      ],
      id: 'peel',
      instruction: '껍질을 잡고 아래로 당겨요.',
      shortLabel: '껍질',
      targetCount: 3,
      title: '껍질 벗기기',
    },
    {
      accessibilityInstruction: '바나나 조각 여섯 개를 하나씩 잡아 오른쪽 그릇으로 옮기세요.',
      hint: '왼쪽 바나나 조각을 하나씩 잡고 오른쪽 그릇까지 여섯 번 끌어 놓아요.',
      hints: [
        '왼쪽 카드에 남은 바나나 조각이 있어요.',
        '조각을 누른 채 오른쪽 그릇 한가운데까지 옮겨요.',
        '오른쪽 화살표를 따라 여섯 조각을 차례로 넣어 보세요.',
      ],
      id: 'split',
      instruction: '한입 크기 조각을 그릇에 옮겨요.',
      shortLabel: '나누기',
      targetCount: 6,
      title: '바나나 나누기',
    },
    {
      accessibilityInstruction: '요거트 컵을 잡아 오른쪽 그릇으로 네 번 옮기세요.',
      hint: '파란 요거트 컵을 잡고 오른쪽 그릇까지 네 숟갈을 차례로 옮겨요.',
      hints: [
        '왼쪽의 파란 요거트 컵을 찾아요.',
        '컵을 누른 채 오른쪽 그릇까지 천천히 옮겨요.',
        '그릇 중앙까지 네 번 끌어 놓으면 알맞은 양이 돼요.',
      ],
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
      hints: [
        '시리얼은 꼭 넣지 않아도 되는 선택 재료예요.',
        '넣고 싶다면 표시를 확인한 뒤 상자를 오른쪽 그릇으로 옮겨요.',
        '안전 정보가 맞지 않으면 아래의 ‘토핑 없이 계속’을 눌러도 정답이에요.',
      ],
      id: 'topping',
      instruction: '토핑을 넣을지 선택해요.',
      shortLabel: '토핑',
      targetCount: 4,
      title: '토핑 선택하기',
    },
    {
      accessibilityInstruction: '숟가락을 잡고 그릇 안에서 원을 세 바퀴 그리며 천천히 섞으세요.',
      hint: '숟가락을 잡은 채 그릇 가장자리를 따라 둥글게 세 바퀴 움직여요.',
      hints: [
        '그릇 위 숟가락 손잡이를 잡아요.',
        '숟가락을 놓지 말고 그릇 가장자리를 따라 큰 원을 그려요.',
        '한 방향으로 원을 끝까지 세 바퀴 그리면 부드럽게 섞여요.',
      ],
      id: 'mix',
      instruction: '숟가락을 잡고 원을 그리며 섞어요.',
      shortLabel: '섞기',
      targetCount: 3,
      title: '부드럽게 섞기',
    },
    {
      accessibilityInstruction: '완성한 그릇을 잡고 오른쪽 식탁 매트 위에 놓으세요.',
      hint: '완성한 그릇을 식탁 매트 중앙에 차려요.',
      hints: [
        '왼쪽에 완성한 요거트 그릇이 있어요.',
        '그릇을 누른 채 오른쪽 초록색 식탁 매트로 옮겨요.',
        '매트 한가운데까지 끌어 놓으면 예쁘게 차려져요.',
      ],
      id: 'plate',
      instruction: '완성한 그릇을 식탁에 차려요.',
      shortLabel: '차리기',
      targetCount: 1,
      title: '식탁에 차리기',
    },
    {
      accessibilityInstruction:
        '바나나 껍질과 빈 요거트 컵을 분류하고, 사용한 숟가락과 그릇은 싱크대로 옮긴 뒤 흘린 요거트를 행주로 닦으세요.',
      hint: '쓰레기를 분류한 뒤 도구를 싱크대로 옮기고 조리대를 닦아요.',
      hints: [
        '먼저 왼쪽에 남은 물건을 확인해요.',
        '껍질은 음식물 통, 빈 컵은 재활용 통, 숟가락과 그릇은 싱크대로 옮겨요.',
        '마지막에는 행주를 잡고 흘린 요거트 자국까지 닦아요.',
      ],
      id: 'cleanup',
      instruction: '쓰레기와 도구를 정리하고 조리대를 닦아요.',
      shortLabel: '정리',
      targetCount: 5,
      title: '주방 정리하기',
    },
  ],
  usesHeat: false,
  usesKnife: false,
};
