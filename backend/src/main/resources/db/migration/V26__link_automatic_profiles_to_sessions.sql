ALTER TABLE behavior_profile_snapshots
    ADD COLUMN source_session_id UUID;

CREATE UNIQUE INDEX uq_behavior_profile_member_source_session
    ON behavior_profile_snapshots(member_id, source_session_id);
