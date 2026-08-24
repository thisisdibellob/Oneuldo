-- 사용자별 자동 난이도를 퀘스트 원본이 이미 지원하는 5단계로 확장한다.
ALTER TABLE user_subcategory_difficulties
    DROP CONSTRAINT chk_user_difficulty_level;
ALTER TABLE user_subcategory_difficulties
    ADD CONSTRAINT chk_user_difficulty_level
        CHECK (current_difficulty IN ('VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'));

ALTER TABLE difficulty_adjustment_history
    DROP CONSTRAINT chk_difficulty_history_previous;
ALTER TABLE difficulty_adjustment_history
    ADD CONSTRAINT chk_difficulty_history_previous
        CHECK (previous_difficulty IN ('VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'));

ALTER TABLE difficulty_adjustment_history
    DROP CONSTRAINT chk_difficulty_history_new;
ALTER TABLE difficulty_adjustment_history
    ADD CONSTRAINT chk_difficulty_history_new
        CHECK (new_difficulty IN ('VERY_EASY', 'EASY', 'NORMAL', 'HARD', 'VERY_HARD'));

-- 기존 EASY/NORMAL 버스 5개와 지하철 1개를 유지하고 부족한 38개 원문을 추가한다.
-- 임시 시드 테이블의 step_count와 choice 범위로 고정 4단계·3선택지 구조를 제거한다.
CREATE TABLE quest_content_seed_v13
(
    seed_no INTEGER PRIMARY KEY,
    mode VARCHAR(10) NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    code VARCHAR(100) NOT NULL,
    title VARCHAR(100) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    goal VARCHAR(500) NOT NULL,
    context_text VARCHAR(1000) NOT NULL,
    step_count INTEGER NOT NULL,
    min_choices INTEGER NOT NULL,
    max_choices INTEGER NOT NULL,
    reward_points INTEGER NOT NULL
);

INSERT INTO quest_content_seed_v13 (
    seed_no, mode, difficulty, code, title, summary, goal, context_text,
    step_count, min_choices, max_choices, reward_points
) VALUES
-- VERY_EASY: 버스 5개, 지하철 5개 / 2~3단계, 2~3선택지
(1, 'BUS', 'VERY_EASY', 'BUS_FIND_NEARBY_STOP_VE', '가까운 버스정류장 찾기',
 '주변 표지판을 보고 버스정류장을 찾아요.', '차도에서 떨어진 안전한 버스정류장 위치를 찾을 수 있다.',
 '처음 가는 길에서 보호자와 함께 가까운 버스정류장을 찾고 있어요.', 2, 2, 3, 10),
(2, 'BUS', 'VERY_EASY', 'BUS_MATCH_NUMBER_VE', '버스 번호 살펴보기',
 '기다리는 버스의 번호를 차분히 확인해요.', '정류장 안내판과 도착한 버스의 번호가 같은지 확인할 수 있다.',
 '정류장 안내판에는 여러 버스 번호가 적혀 있고 곧 버스가 도착해요.', 3, 2, 3, 10),
(3, 'BUS', 'VERY_EASY', 'BUS_WAIT_IN_LINE_VE', '정류장에서 줄 서기',
 '차도에서 떨어져 차례대로 버스를 기다려요.', '정류장의 안전한 위치에서 줄을 지켜 기다릴 수 있다.',
 '정류장에 몇 사람이 줄을 서서 버스를 기다리고 있어요.', 2, 2, 3, 10),
(4, 'BUS', 'VERY_EASY', 'BUS_BOARD_AFTER_STOP_VE', '버스가 멈춘 뒤 타기',
 '버스가 완전히 멈춘 것을 보고 천천히 타요.', '버스가 정차한 뒤 내리는 사람을 살피며 차례로 탈 수 있다.',
 '기다리던 버스가 정류장에 들어오고 있어요.', 3, 2, 3, 10),
(5, 'BUS', 'VERY_EASY', 'BUS_HOLD_HANDLE_VE', '버스에서 손잡이 잡기',
 '버스가 움직일 때 손잡이를 잡고 안전하게 서 있어요.', '버스 안에서 안전한 자리를 잡고 손잡이를 이용할 수 있다.',
 '빈 좌석이 없어 버스 안에 서서 이동해야 해요.', 2, 2, 3, 10),
(6, 'SUBWAY', 'VERY_EASY', 'SUBWAY_FIND_ENTRANCE_VE', '지하철역 입구 찾기',
 '역 이름과 지하철 표시를 보고 입구를 찾아요.', '공식 표지에서 지하철역 이름과 입구를 확인할 수 있다.',
 '건물 사이에 여러 표지가 있고 가까운 지하철역을 찾고 있어요.', 3, 2, 3, 10),
(7, 'SUBWAY', 'VERY_EASY', 'SUBWAY_MATCH_LINE_COLOR_VE', '지하철 노선 색 확인하기',
 '목적지 노선의 색과 번호를 함께 살펴봐요.', '노선도에서 목적지로 가는 노선의 색과 번호를 확인할 수 있다.',
 '역 안 노선도에 여러 색의 노선이 표시되어 있어요.', 2, 2, 3, 10),
(8, 'SUBWAY', 'VERY_EASY', 'SUBWAY_PREPARE_TRANSIT_CARD_VE', '개찰구에서 교통카드 준비하기',
 '카드를 준비하고 열린 개찰구를 한 사람씩 지나가요.', '개찰구 진행 방향을 확인하고 교통카드를 한 번 댈 수 있다.',
 '개찰구 앞에 도착했고 가방 안에 교통카드가 있어요.', 3, 2, 3, 10),
(9, 'SUBWAY', 'VERY_EASY', 'SUBWAY_WAIT_BEHIND_SAFETY_LINE_VE', '안전선 안쪽에서 기다리기',
 '승강장 안전선 안쪽에서 열차를 기다려요.', '승강장에서 안전한 위치를 찾아 기다릴 수 있다.',
 '승강장에 열차 도착 안내가 나오고 있어요.', 2, 2, 3, 10),
(10, 'SUBWAY', 'VERY_EASY', 'SUBWAY_LET_PASSENGERS_EXIT_VE', '내리는 사람 기다리기',
 '문이 열리면 내리는 사람이 먼저 지나가게 해요.', '열차 문 앞에서 내리는 승객을 기다린 뒤 차례로 탈 수 있다.',
 '열차가 도착해 문이 열리고 여러 승객이 내리려고 해요.', 3, 2, 3, 10),

-- EASY: 기존 지하철 1개에 4개 추가 / 3~4단계, 2~3선택지
(11, 'SUBWAY', 'EASY', 'SUBWAY_CHOOSE_GATE_E', '알맞은 개찰구 이용하기',
 '진행 방향과 카드 인식부를 확인하고 개찰구를 지나가요.', '열린 개찰구의 진행 방향을 확인하고 안전하게 통과할 수 있다.',
 '역 안에 들어가려는데 들어가는 곳과 나오는 곳 개찰구가 나뉘어 있어요.', 3, 2, 3, 20),
(12, 'SUBWAY', 'EASY', 'SUBWAY_CHECK_PLATFORM_DIRECTION_E', '승강장 방면 확인하기',
 '목적지 방향의 역 이름을 보고 알맞은 승강장으로 가요.', '같은 노선의 서로 다른 운행 방면을 구분할 수 있다.',
 '같은 노선 승강장이 두 방면으로 나뉘어 있어요.', 4, 2, 3, 20),
(13, 'SUBWAY', 'EASY', 'SUBWAY_RIDE_SAFELY_E', '지하철 안에서 안전하게 이동하기',
 '손잡이를 잡고 문에 기대지 않으며 안내를 확인해요.', '열차 안에서 안전한 자세로 목적지 안내를 확인할 수 있다.',
 '열차 안에 빈 좌석이 없어 출입문 근처에 서게 되었어요.', 3, 2, 3, 20),
(14, 'SUBWAY', 'EASY', 'SUBWAY_EXIT_AT_DESTINATION_E', '목적지 역에서 내리기',
 '역 이름을 확인하고 열차가 멈춘 뒤 차례로 내려요.', '안내 화면과 방송으로 목적지 역을 확인하고 안전하게 내릴 수 있다.',
 '안내 화면에 다음 역이 목적지라고 표시되었어요.', 4, 2, 3, 20),

-- NORMAL: 기존 지하철 1개에 4개 추가 / 4~5단계, 3~4선택지
(15, 'SUBWAY', 'NORMAL', 'SUBWAY_COMPARE_EXPRESS_LOCAL_N', '급행과 일반 열차 구분하기',
 '정차역 안내를 비교해 목적지에 서는 열차를 선택해요.', '급행과 일반 열차의 정차역 차이를 확인할 수 있다.',
 '같은 승강장에 급행과 일반 열차가 번갈아 도착해요.', 4, 3, 4, 30),
(16, 'SUBWAY', 'NORMAL', 'SUBWAY_HANDLE_CROWDED_TRAIN_N', '혼잡한 지하철 이용하기',
 '사람이 많아도 안전선과 차례를 지키며 이동해요.', '혼잡한 승강장과 열차 안에서 안전한 위치를 선택할 수 있다.',
 '퇴근 시간이라 승강장과 열차 안에 사람이 많아요.', 5, 3, 4, 30),
(17, 'SUBWAY', 'NORMAL', 'SUBWAY_HANDLE_GATE_CARD_ERROR_N', '개찰구 카드 오류 해결하기',
 '통행을 막지 않는 곳에서 카드 상태를 확인하고 도움을 요청해요.', '개찰구 결제 오류가 생겼을 때 안전하게 대처할 수 있다.',
 '교통카드를 댔지만 개찰구가 열리지 않고 오류음이 들려요.', 4, 3, 4, 30),
(18, 'SUBWAY', 'NORMAL', 'SUBWAY_CHECK_SERVICE_CHANGE_N', '지하철 운행 변경 확인하기',
 '운행 변경 안내를 확인하고 가능한 이동 방법을 다시 찾아요.', '지하철 운행이 변경됐을 때 공식 안내에 따라 경로를 조정할 수 있다.',
 '점검 때문에 일부 구간의 열차 운행이 변경됐다는 안내가 나와요.', 5, 3, 4, 30),

-- HARD: 버스 5개, 지하철 5개 / 5~6단계, 3~4선택지
(19, 'BUS', 'HARD', 'BUS_PLAN_UNFAMILIAR_ROUTE_H', '낯선 지역 버스 경로 계획하기',
 '노선과 경유 정류장을 비교해 낯선 지역의 이동 경로를 계획해요.', '낯선 지역에서도 공식 정보를 이용해 버스 경로를 계획할 수 있다.',
 '처음 가는 지역에서 목적지까지 가는 버스 노선이 여러 개 검색됐어요.', 5, 3, 4, 40),
(20, 'BUS', 'HARD', 'BUS_USE_DETOUR_STOP_H', '임시 정류장으로 이동하기',
 '우회 운행 안내를 읽고 안전한 임시 정류장을 찾아가요.', '공사로 정류장이 바뀌었을 때 공식 안내를 따라 이동할 수 있다.',
 '도로 공사로 평소 정류장을 이용하지 않고 임시 정류장에서 탄다는 안내가 있어요.', 6, 3, 4, 40),
(21, 'BUS', 'HARD', 'BUS_TRANSFER_MULTIPLE_ROUTES_H', '두 번 버스 갈아타기',
 '각 환승 지점에서 다음 버스의 번호와 방향을 다시 확인해요.', '두 번의 버스 환승 순서를 기억하고 단계마다 경로를 확인할 수 있다.',
 '목적지까지 가려면 서로 다른 버스를 두 번 갈아타야 해요.', 5, 3, 4, 40),
(22, 'BUS', 'HARD', 'BUS_FIND_LAST_SERVICE_ALTERNATIVE_H', '막차 이후 안전한 방법 찾기',
 '운행 종료 안내를 확인하고 보호자와 안전한 대안을 정해요.', '예정한 버스 운행이 끝났을 때 임의로 이동하지 않고 도움을 요청할 수 있다.',
 '정류장 안내 화면에 기다리던 노선의 운행이 종료됐다고 표시돼요.', 6, 3, 4, 40),
(23, 'BUS', 'HARD', 'BUS_RECOVER_WRONG_DIRECTION_H', '반대 방향 버스에서 대처하기',
 '다음 안전한 정류장에서 내려 현재 위치를 확인하고 경로를 다시 찾아요.', '잘못된 방향의 버스를 탔을 때 차분하게 안전한 복귀 방법을 찾을 수 있다.',
 '안내 화면을 보니 버스가 목적지와 반대 방향으로 가고 있어요.', 5, 3, 4, 40),
(24, 'SUBWAY', 'HARD', 'SUBWAY_COMPLEX_TRANSFER_H', '복잡한 환승역 지나가기',
 '여러 환승 표지 중 목적 노선과 방면을 단계별로 확인해요.', '큰 환승역에서 출구와 환승 통로를 구분해 이동할 수 있다.',
 '큰 환승역에 내리자 여러 노선과 출구를 가리키는 표지가 함께 보여요.', 6, 3, 4, 40),
(25, 'SUBWAY', 'HARD', 'SUBWAY_COMPARE_ROUTE_OPTIONS_H', '지하철 경로 두 가지 비교하기',
 '환승 횟수와 정차역을 비교해 이해하기 쉬운 경로를 선택해요.', '여러 지하철 경로의 환승과 이동 단계를 비교할 수 있다.',
 '목적지까지 빠르지만 환승이 많은 경로와 조금 느리지만 단순한 경로가 있어요.', 5, 3, 4, 40),
(26, 'SUBWAY', 'HARD', 'SUBWAY_HANDLE_LINE_SUSPENSION_H', '노선 운행 중단에 대처하기',
 '공식 안내에서 중단 구간과 대체 경로를 확인해 이동 계획을 바꿔요.', '일부 노선 운행이 중단됐을 때 확인된 대체 경로를 찾을 수 있다.',
 '환승하려던 노선이 안전 점검으로 잠시 운행을 멈췄다는 안내가 나와요.', 6, 3, 4, 40),
(27, 'SUBWAY', 'HARD', 'SUBWAY_NAVIGATE_MAJOR_STATION_H', '큰 역에서 목적 출구 찾기',
 '출구 번호와 연결 시설 안내를 확인하며 목적 장소로 이동해요.', '출구가 많은 역에서 목적지와 연결되는 출구를 구분할 수 있다.',
 '도착한 역에는 출구가 많고 출구마다 연결되는 도로와 시설이 달라요.', 5, 3, 4, 40),
(28, 'SUBWAY', 'HARD', 'SUBWAY_RECOVER_MISSED_STATION_H', '목적지 역을 지나쳤을 때',
 '다음 역에서 내려 반대 방면을 확인하고 안전하게 되돌아가요.', '목적지 역을 지나친 뒤 임의로 선로를 건너지 않고 경로를 복구할 수 있다.',
 '안내 화면을 확인하니 내려야 할 역을 한 정거장 지나쳤어요.', 6, 3, 4, 40),

-- VERY_HARD: 버스 5개, 지하철 5개 / 6~7단계, 4~5선택지
(29, 'BUS', 'VERY_HARD', 'BUS_MULTIMODAL_ROUTE_VH', '버스와 다른 교통수단 함께 이용하기',
 '버스와 철도 구간을 연결해 긴 이동의 순서를 계획해요.', '여러 교통수단이 포함된 경로를 구간별로 확인하고 수행할 수 있다.',
 '목적지까지 버스를 탄 뒤 철도로 갈아타고 다시 걸어가야 해요.', 6, 4, 5, 50),
(30, 'BUS', 'VERY_HARD', 'BUS_HANDLE_MULTIPLE_DISRUPTIONS_VH', '여러 운행 변경에 대처하기',
 '정류장 변경과 배차 지연이 겹쳐도 공식 안내로 계획을 다시 세워요.', '두 가지 이상의 운행 문제가 생겼을 때 우선순위를 정해 대처할 수 있다.',
 '공사로 정류장이 바뀐 데다 이용하려던 버스도 많이 늦어진다는 안내가 나와요.', 7, 4, 5, 50),
(31, 'BUS', 'VERY_HARD', 'BUS_PLAN_SAFE_LATE_RETURN_VH', '늦은 시간 안전한 귀가 계획 세우기',
 '남은 운행 정보와 보호자 연락 방법을 확인해 안전한 귀가 경로를 정해요.', '늦은 시간 대중교통 선택에서 안전을 우선해 계획할 수 있다.',
 '예정보다 일정이 늦어져 평소 이용하던 버스의 남은 운행 횟수가 적어요.', 6, 4, 5, 50),
(32, 'BUS', 'VERY_HARD', 'BUS_PLAN_ACCESSIBLE_ROUTE_VH', '이동 지원이 필요한 버스 경로 찾기',
 '저상버스와 안전한 환승 위치를 확인해 이동 부담이 적은 경로를 찾아요.', '이동 지원 조건을 고려해 확인 가능한 버스 경로를 선택할 수 있다.',
 '계단 이용이 어려운 동행자와 함께 여러 버스를 갈아타야 해요.', 7, 4, 5, 50),
(33, 'BUS', 'VERY_HARD', 'BUS_REPLAN_AFTER_MISSED_TRANSFER_VH', '연속 환승을 놓친 뒤 다시 계획하기',
 '현재 위치와 남은 노선을 다시 확인해 안전하게 새 경로를 만들어요.', '복잡한 환승이 끊겼을 때 이전 계획에 집착하지 않고 경로를 재구성할 수 있다.',
 '첫 번째 버스가 늦게 도착해 다음 환승 버스를 놓쳤어요.', 6, 4, 5, 50),
(34, 'SUBWAY', 'VERY_HARD', 'SUBWAY_MULTILINE_ROUTE_VH', '여러 지하철 노선 이어서 이용하기',
 '세 개 이상의 노선을 이용하는 순서와 방면을 구간마다 확인해요.', '복수 환승 경로를 노선·역·방면 단위로 나누어 수행할 수 있다.',
 '목적지까지 세 개의 지하철 노선을 차례로 갈아타야 해요.', 7, 4, 5, 50),
(35, 'SUBWAY', 'VERY_HARD', 'SUBWAY_HANDLE_SIMULTANEOUS_CHANGES_VH', '두 노선 운행 변경 해결하기',
 '여러 변경 안내에서 내 경로에 필요한 정보만 골라 대안을 찾아요.', '복수 노선의 운행 변경이 겹쳤을 때 확인된 정보로 경로를 재구성할 수 있다.',
 '첫 환승 노선은 지연되고 다음 환승 노선은 일부 구간을 운행하지 않아요.', 6, 4, 5, 50),
(36, 'SUBWAY', 'VERY_HARD', 'SUBWAY_SAFE_EMERGENCY_RESPONSE_VH', '지하철 비상 안내에 따라 행동하기',
 '비상 방송을 듣고 역 직원의 안내에 따라 안전한 이동 순서를 선택해요.', '지하철 비상 상황에서 임의 행동을 피하고 공식 안내를 따를 수 있다.',
 '열차가 역에 멈춘 뒤 안전 확인을 위해 잠시 내리라는 안내 방송이 나와요.', 7, 4, 5, 50),
(37, 'SUBWAY', 'VERY_HARD', 'SUBWAY_PLAN_ACCESSIBLE_TRANSFER_VH', '이동 지원을 고려해 환승하기',
 '엘리베이터와 이동 지원 시설의 공식 안내를 확인해 환승 경로를 계획해요.', '이동 지원이 필요한 상황에서 이용 가능한 시설을 확인하고 도움을 요청할 수 있다.',
 '계단을 이용하기 어려운 동행자와 복잡한 환승역을 지나야 해요.', 6, 4, 5, 50),
(38, 'SUBWAY', 'VERY_HARD', 'SUBWAY_REPLAN_COMPLEX_JOURNEY_VH', '긴 지하철 여정 다시 계획하기',
 '환승을 놓친 현재 위치에서 남은 노선과 방면을 다시 조합해요.', '긴 이동 중 계획이 어긋났을 때 안전하게 현재 위치부터 다시 계획할 수 있다.',
 '첫 환승역을 지나쳐 예정한 두 번째 환승 시간도 맞추기 어려워졌어요.', 7, 4, 5, 50);

INSERT INTO quests (
    id, subcategory_id, code, title, summary, goal,
    difficulty, reward_points, active, created_at, updated_at
)
SELECT
    CAST('31000000-0000-0000-0000-' || LPAD(CAST(seed_no AS VARCHAR), 12, '0') AS UUID),
    '20000000-0000-0000-0000-000000000001',
    code, title, summary, goal, difficulty, reward_points, TRUE,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM quest_content_seed_v13;

INSERT INTO quest_steps (
    id, quest_id, step_order, instruction, situation, hint, created_at, updated_at
)
SELECT
    CAST('41000000-0000-0000-0000-' || LPAD(CAST(seed.seed_no * 10 + numbers.step_order AS VARCHAR), 12, '0') AS UUID),
    CAST('31000000-0000-0000-0000-' || LPAD(CAST(seed.seed_no AS VARCHAR), 12, '0') AS UUID),
    numbers.step_order,
    CASE seed.mode
        WHEN 'BUS' THEN CASE numbers.step_order
            WHEN 1 THEN '목적지로 가는 버스와 운행 방향을 확인해 보세요.'
            WHEN 2 THEN '정류장에서 안전하게 기다리는 방법을 선택해 보세요.'
            WHEN 3 THEN '버스가 도착했을 때 차례로 타 보세요.'
            WHEN 4 THEN '이동 중 안내를 확인하며 안전한 자세를 유지해 보세요.'
            WHEN 5 THEN '목적지에서 안전하게 내릴 준비를 해 보세요.'
            WHEN 6 THEN '예상과 다른 일이 생겼을 때 도움을 요청해 보세요.'
            ELSE '도착한 장소와 다음 이동 방향을 다시 확인해 보세요.'
        END
        ELSE CASE numbers.step_order
            WHEN 1 THEN '목적지로 가는 노선과 방면을 확인해 보세요.'
            WHEN 2 THEN '개찰구와 이동 표지를 안전하게 이용해 보세요.'
            WHEN 3 THEN '승강장에서 안전한 위치를 선택해 보세요.'
            WHEN 4 THEN '열차 안에서 안내를 확인하며 이동해 보세요.'
            WHEN 5 THEN '환승이나 하차 지점을 정확히 확인해 보세요.'
            WHEN 6 THEN '예상과 다른 일이 생겼을 때 공식 도움을 찾아보세요.'
            ELSE '역을 나가기 전 목적지와 출구를 다시 확인해 보세요.'
        END
    END,
    seed.context_text || ' 지금은 ' || CASE numbers.step_order
        WHEN 1 THEN '출발 전에 필요한 정보를 확인할 차례예요.'
        WHEN 2 THEN '이동을 시작할 위치와 방향을 고를 차례예요.'
        WHEN 3 THEN '차량이나 열차에 안전하게 탈 차례예요.'
        WHEN 4 THEN '이동하면서 안내와 주변을 확인할 차례예요.'
        WHEN 5 THEN '내리거나 갈아탈 지점을 준비할 차례예요.'
        WHEN 6 THEN '달라진 상황에서 안전한 도움을 찾을 차례예요.'
        ELSE '도착 후 현재 위치와 다음 행동을 확인할 차례예요.'
    END,
    CASE seed.mode
        WHEN 'BUS' THEN '버스 번호뿐 아니라 행선지·방향·정류장 안내를 함께 확인해요.'
        ELSE '노선 색이나 번호뿐 아니라 역 이름·방면·환승 표지를 함께 확인해요.'
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM quest_content_seed_v13 seed
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6), (7)) numbers(step_order)
WHERE numbers.step_order <= seed.step_count;

INSERT INTO quest_choices (
    id, step_id, choice_order, label, correct, feedback, created_at, updated_at
)
SELECT
    CAST('51000000-0000-0000-0000-' || LPAD(CAST(seed.seed_no * 100 + steps.step_order * 10 + choices.choice_order AS VARCHAR), 12, '0') AS UUID),
    CAST('41000000-0000-0000-0000-' || LPAD(CAST(seed.seed_no * 10 + steps.step_order AS VARCHAR), 12, '0') AS UUID),
    choices.choice_order,
    CASE
        WHEN choices.choice_order = 1 AND seed.mode = 'BUS' THEN CASE steps.step_order
            WHEN 1 THEN '공식 안내에서 버스 번호와 행선지, 운행 방향을 함께 확인한다.'
            WHEN 2 THEN '차도에서 떨어진 곳에서 안내를 확인하며 차례를 지킨다.'
            WHEN 3 THEN '버스가 완전히 멈춘 뒤 내리는 사람을 살피고 차례로 탄다.'
            WHEN 4 THEN '손잡이를 잡고 안내 방송과 화면으로 현재 위치를 확인한다.'
            WHEN 5 THEN '목적지 전 정류장 무렵 준비하고 버스가 멈춘 뒤 내린다.'
            WHEN 6 THEN '통행을 막지 않는 안전한 곳에서 기사나 보호자에게 상황을 알린다.'
            ELSE '정류장 이름과 주변 표지를 확인한 뒤 안전한 보행로로 이동한다.'
        END
        WHEN choices.choice_order = 1 THEN CASE steps.step_order
            WHEN 1 THEN '노선도에서 노선과 목적지 방면의 역 이름을 함께 확인한다.'
            WHEN 2 THEN '진행 방향을 확인하고 열린 개찰구와 안내 표지를 차례로 이용한다.'
            WHEN 3 THEN '안전선 안쪽에서 기다리고 내리는 승객 뒤에 차례로 탄다.'
            WHEN 4 THEN '손잡이를 잡고 방송과 화면으로 현재 역과 다음 역을 확인한다.'
            WHEN 5 THEN '환승 노선이나 목적지 역 이름을 확인하고 멈춘 뒤 이동한다.'
            WHEN 6 THEN '안전한 곳에서 고객안전실이나 역 직원에게 현재 상황을 알린다.'
            ELSE '출구 번호와 목적 장소 안내를 확인한 뒤 안전한 통로로 이동한다.'
        END
        WHEN choices.choice_order = 2 THEN '다른 사람이 많이 가는 쪽을 확인 없이 따라간다.'
        WHEN choices.choice_order = 3 THEN '안내를 보지 않고 가장 가까운 곳으로 바로 이동한다.'
        WHEN choices.choice_order = 4 THEN '시간을 아끼려고 뛰거나 사람을 밀며 먼저 이동한다.'
        ELSE '모르는 내용을 확인하지 않고 임의로 결정한다.'
    END,
    CASE WHEN choices.choice_order = 1 THEN TRUE ELSE FALSE END,
    CASE choices.choice_order
        WHEN 1 THEN '좋아요! 공식 안내를 확인하고 단계에 맞는 안전한 행동을 골랐어요.'
        WHEN 2 THEN '다른 사람의 목적지는 다를 수 있으니 공식 안내를 직접 확인해요.'
        WHEN 3 THEN '가까운 곳보다 목적지로 가는 노선과 방향인지 먼저 확인해요.'
        WHEN 4 THEN '뛰거나 밀지 말고 안전한 위치에서 다음 기회를 기다려요.'
        ELSE '확실하지 않을 때는 추측하지 말고 확인 가능한 사람에게 도움을 요청해요.'
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM quest_content_seed_v13 seed
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6), (7)) steps(step_order)
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) choices(choice_order)
WHERE steps.step_order <= seed.step_count
  AND choices.choice_order <= seed.min_choices
      + MOD(seed.seed_no + steps.step_order, seed.max_choices - seed.min_choices + 1);

DROP TABLE quest_content_seed_v13;
