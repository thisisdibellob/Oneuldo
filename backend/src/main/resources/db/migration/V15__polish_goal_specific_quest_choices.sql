-- 제목의 종결 형태와 조사를 억지로 결합하지 않고, 퀘스트 단위 표현으로 자연스럽게 정리한다.
UPDATE quest_choices c
SET label = (
        SELECT CASE c.choice_order
            WHEN 2 THEN q.title || ' 퀘스트에서 안내를 확인하지 않고 다른 사람만 따라간다.'
            WHEN 3 THEN q.title || ' 퀘스트에서 확인 없이 가장 가까운 곳으로 바로 이동한다.'
            WHEN 4 THEN q.title || ' 퀘스트를 빨리 끝내려고 뛰거나 사람을 민다.'
            ELSE q.title || ' 퀘스트의 방법을 확인하지 않고 임의로 결정한다.'
        END
        FROM quest_steps s
        JOIN quests q ON q.id = s.quest_id
        WHERE s.id = c.step_id
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE c.correct = FALSE
  AND EXISTS (
      SELECT 1
      FROM quest_steps s
      JOIN quests q ON q.id = s.quest_id
      WHERE s.id = c.step_id
        AND CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
  );
