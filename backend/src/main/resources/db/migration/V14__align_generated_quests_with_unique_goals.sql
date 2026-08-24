-- V13에서 교통수단과 단계 번호만으로 공유하던 문장을 제거한다.
-- 각 퀘스트의 고유 summary(실행 목표)와 title을 사용해 단계·선택지를 다시 맞춘다.

UPDATE quest_steps s
SET instruction = CASE s.step_order
        WHEN 1 THEN q.summary
        WHEN 2 THEN '서두르지 말고 ' || q.summary
        WHEN 3 THEN '주변 안전을 살피면서 ' || q.summary
        WHEN 4 THEN '공식 안내를 확인한 뒤 ' || q.summary
        WHEN 5 THEN '현재 위치를 다시 확인하고 ' || q.summary
        WHEN 6 THEN '필요하면 도움을 요청하면서 ' || q.summary
        ELSE '마지막으로 안내를 확인하고 ' || q.summary
    END,
    situation = CASE
        WHEN POSITION(' 지금은 ' IN s.situation) > 0
            THEN SUBSTRING(s.situation FROM 1 FOR POSITION(' 지금은 ' IN s.situation) - 1)
        ELSE s.situation
    END,
    hint = q.goal,
    updated_at = CURRENT_TIMESTAMP
FROM quests q
WHERE s.quest_id = q.id
  AND CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%';

UPDATE quest_choices c
SET label = (
        SELECT CASE
            WHEN c.correct AND s.step_order = 1 THEN q.summary
            WHEN c.correct AND s.step_order = 2 THEN '서두르지 않고 ' || q.summary
            WHEN c.correct AND s.step_order = 3 THEN '주변 안전을 살핀 뒤 ' || q.summary
            WHEN c.correct AND s.step_order = 4 THEN '공식 안내를 확인하고 ' || q.summary
            WHEN c.correct AND s.step_order = 5 THEN '현재 위치를 다시 확인한 뒤 ' || q.summary
            WHEN c.correct AND s.step_order = 6 THEN '필요하면 도움을 요청한 뒤 ' || q.summary
            WHEN c.correct THEN '마지막 안내까지 확인하고 ' || q.summary
            WHEN c.choice_order = 2 THEN q.title || '에 필요한 안내를 보지 않고 다른 사람만 따라간다.'
            WHEN c.choice_order = 3 THEN q.title || ' 방법을 확인하지 않고 가장 가까운 곳으로 바로 이동한다.'
            WHEN c.choice_order = 4 THEN q.title || '을 빨리 끝내려고 뛰거나 사람을 민다.'
            ELSE q.title || ' 방법을 확인하지 않고 임의로 결정한다.'
        END
        FROM quest_steps s
        JOIN quests q ON q.id = s.quest_id
        WHERE s.id = c.step_id
    ),
    feedback = CASE
        WHEN c.correct THEN '좋아요! 이 퀘스트의 목표에 맞는 행동을 골랐어요.'
        ELSE '퀘스트의 목표와 공식 안내를 다시 확인해요.'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM quest_steps s
    JOIN quests q ON q.id = s.quest_id
    WHERE s.id = c.step_id
      AND CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
);
