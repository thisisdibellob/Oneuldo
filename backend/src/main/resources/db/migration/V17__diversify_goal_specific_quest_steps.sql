-- 같은 퀘스트 안에서도 단계별 상황과 오답 행동이 반복되지 않도록 진행 맥락을 부여한다.
UPDATE quest_steps s
SET situation = CASE s.step_order
        WHEN 1 THEN s.situation
        WHEN 2 THEN s.situation || ' 무엇을 먼저 확인할지 차분히 살펴봐요.'
        WHEN 3 THEN s.situation || ' 이제 안전한 행동을 하나씩 실천해야 해요.'
        WHEN 4 THEN s.situation || ' 이동하면서 안내와 주변 상황이 맞는지 다시 살펴봐요.'
        WHEN 5 THEN s.situation || ' 목적지에 가까워져 다음 행동을 준비해야 해요.'
        WHEN 6 THEN s.situation || ' 예상과 다른 점이 생겨 확인 가능한 도움을 찾아야 해요.'
        ELSE s.situation || ' 이동을 마치기 전에 현재 위치와 다음 방향을 확인해요.'
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM quests q
    WHERE q.id = s.quest_id
      AND CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
);

UPDATE quest_choices c
SET label = CASE MOD(s.step_order + c.choice_order, 6)
        WHEN 0 THEN '공식 안내를 보지 않고 다른 사람의 행동만 따라간다.'
        WHEN 1 THEN '현재 위치와 방향을 확인하지 않고 바로 이동한다.'
        WHEN 2 THEN '시간을 아끼려고 뛰거나 사람을 밀고 먼저 이동한다.'
        WHEN 3 THEN '방송과 표지를 무시하고 들은 내용을 추측해서 행동한다.'
        WHEN 4 THEN '안전한 위치를 살피지 않고 눈앞의 이동 수단을 바로 이용한다.'
        ELSE '확실하지 않은데도 도움을 요청하지 않고 마음대로 결정한다.'
    END,
    updated_at = CURRENT_TIMESTAMP
FROM quest_steps s
WHERE c.step_id = s.id
  AND c.correct = FALSE
  AND EXISTS (
      SELECT 1 FROM quests q
      WHERE q.id = s.quest_id
        AND CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
  );
