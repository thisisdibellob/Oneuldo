CREATE TABLE ai_analysis_jobs (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES member(id),
 session_id uuid NOT NULL, dataset_id uuid NOT NULL REFERENCES behavior_analysis_input_snapshots(id),
 prompt_version varchar(80) NOT NULL,
 status varchar(20) NOT NULL, stage varchar(30) NOT NULL,
 completed integer NOT NULL DEFAULT 0, total integer NOT NULL DEFAULT 0,
 wait_until timestamptz, owner_id uuid, lease_until timestamptz,
 starts integer NOT NULL DEFAULT 0,
 analysis_id uuid REFERENCES ai_behavior_analyses(id), error_code varchar(100),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ck_analysis_job_status CHECK(status IN ('QUEUED','RUNNING','READY','FAILED'))
);
CREATE UNIQUE INDEX uq_analysis_job_active ON ai_analysis_jobs(member_id,session_id,dataset_id)
 WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX idx_analysis_job_member ON ai_analysis_jobs(member_id,created_at DESC);
CREATE INDEX idx_analysis_job_queue ON ai_analysis_jobs(status,created_at);
