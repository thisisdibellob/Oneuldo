-- 정규화 버전을 병행하지 않고 현재 v1 규칙을 교체하므로 파생 데이터만 다시 만든다.
-- 원본 behavior_logs와 세션 무결성 데이터는 보존한다.
DELETE FROM behavior_profile_snapshots
WHERE normalizer_version = 'behavior-normalizer-v1';

DELETE FROM behavior_normalization_attempts
WHERE normalizer_version = 'behavior-normalizer-v1';

DELETE FROM normalized_behavior_events
WHERE normalizer_version = 'behavior-normalizer-v1';
