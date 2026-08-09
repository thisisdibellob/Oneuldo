-- 생활 상위 카테고리 추가
INSERT INTO quest_categories (
    id,
    code,
    name,
    sort_order,
    active,
    created_at,
    updated_at
) VALUES (
    '10000000-0000-0000-0000-000000000001',
    'LIFE',
    '생활',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- 퀘스트 세부 카테고리 추가
INSERT INTO quest_subcategories (
    id,
    category_id,
    code,
    name,
    min_difficulty,
    max_difficulty,
    sort_order,
    active,
    created_at,
    updated_at
) VALUES
(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'PUBLIC_TRANSPORT',
    '대중교통',
    'VERY_EASY',
    'VERY_HARD',
    1,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'DAILY_LIFE',
    '생활 훈련',
    'VERY_EASY',
    'VERY_HARD',
    2,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'ECONOMIC_LIFE',
    '경제생활',
    'VERY_EASY',
    'VERY_HARD',
    3,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'SAFETY',
    '안전',
    'VERY_EASY',
    'VERY_HARD',
    4,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- 프론트 퀘스트 화면에서 사용할 초기 퀘스트 추가
INSERT INTO quests (
    id,
    subcategory_id,
    code,
    title,
    summary,
    goal,
    difficulty,
    reward_points,
    active,
    created_at,
    updated_at
) VALUES
(
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'TAKE_BUS_ALONE',
    '혼자 버스 타기',
    '목적지까지 가는 버스를 찾고 안전하게 이용해봐요!',
    '버스 번호와 목적지를 확인하고 혼자 버스를 이용할 수 있다.',
    'EASY',
    20,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'ORDER_AT_CAFE',
    '카페에서 주문하기',
    '원하는 메뉴를 고르고 직원에게 또박또박 말해봐요.',
    '카페에서 원하는 메뉴를 직접 주문할 수 있다.',
    'EASY',
    20,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000003',
    'SHOP_AT_MARKET',
    '마트에서 장보기',
    '예산 안에서 필요한 물건을 직접 골라 계산해요.',
    '필요한 물건을 고르고 예산 안에서 계산할 수 있다.',
    'NORMAL',
    30,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000004',
    'ASK_FOR_HELP',
    '도움을 요청하는 법',
    '곤란한 상황에서 믿을 수 있는 사람에게 도움을 요청해요.',
    '위험하거나 곤란한 상황에서 적절하게 도움을 요청할 수 있다.',
    'EASY',
    20,
    TRUE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);