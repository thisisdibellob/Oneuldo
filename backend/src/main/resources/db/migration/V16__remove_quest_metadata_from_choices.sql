-- 학습자에게 보이는 선택지에는 내부 퀘스트 제목이나 "퀘스트" 메타 표현을 노출하지 않는다.
UPDATE quest_choices c
SET label = CASE c.choice_order
        WHEN 2 THEN '안내를 확인하지 않고 다른 사람의 행동만 따라간다.'
        WHEN 3 THEN '상황을 확인하지 않고 가장 가까운 곳으로 바로 이동한다.'
        WHEN 4 THEN '서두르며 뛰거나 사람을 밀고 먼저 이동한다.'
        ELSE '안전한 방법을 확인하지 않고 마음대로 결정한다.'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE c.correct = FALSE
  AND EXISTS (
      SELECT 1
      FROM quest_steps s
      JOIN quests q ON q.id = s.quest_id
      WHERE s.id = c.step_id
        AND CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
  );
