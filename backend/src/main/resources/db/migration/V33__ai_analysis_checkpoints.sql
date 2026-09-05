CREATE TABLE ai_analysis_checkpoints (
    id VARCHAR(64) PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES behavior_analysis_input_snapshots(id) ON DELETE CASCADE,
    system_prompt TEXT NOT NULL,
    input_prompt TEXT NOT NULL,
    output_max INTEGER NOT NULL,
    response JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_ai_checkpoint_owner_dataset ON ai_analysis_checkpoints(member_id, dataset_id);
