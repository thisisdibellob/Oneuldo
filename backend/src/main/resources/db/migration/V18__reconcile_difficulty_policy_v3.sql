-- v2의 최대 단계 수 조건 하나 때문에 유지된 사용자는 v3 기준으로 한 단계 승급시킨다.
UPDATE user_subcategory_difficulties state
SET current_difficulty = CASE state.current_difficulty
        WHEN 'VERY_EASY' THEN 'EASY'
        WHEN 'EASY' THEN 'NORMAL'
        WHEN 'NORMAL' THEN 'HARD'
        WHEN 'HARD' THEN 'VERY_HARD'
        ELSE state.current_difficulty
    END,
    sessions_since_evaluation = 0,
    last_evaluated_at = CURRENT_TIMESTAMP,
    last_changed_at = CURRENT_TIMESTAMP,
    rule_version = 'five-level-difficulty-v3'
WHERE state.current_difficulty <> 'VERY_HARD'
  AND state.rule_version = 'five-level-difficulty-v2'
  AND EXISTS (
      SELECT 1
      FROM difficulty_adjustment_history history
      WHERE history.member_id = state.member_id
        AND history.subcategory_id = state.subcategory_id
        AND history.created_at = (
            SELECT MAX(latest.created_at)
            FROM difficulty_adjustment_history latest
            WHERE latest.member_id = state.member_id
              AND latest.subcategory_id = state.subcategory_id
        )
        AND history.decision = 'MAINTAIN'
        AND history.reason_codes = 'THRESHOLD_NOT_MET'
        AND history.evaluated_session_count >= 3
        AND history.completion_rate = 1.0
        AND history.first_attempt_accuracy >= 0.85
        AND history.hint_use_rate <= 0.20
        AND history.retry_rate <= 0.20
        AND history.distinct_quest_count >= 2
  );
