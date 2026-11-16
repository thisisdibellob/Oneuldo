-- Durable mirror of quest generation jobs. The quest itself stays in market_ai_quest_generations;
-- this row lets a status request after a restart return the real outcome instead of 404.
CREATE TABLE ai_quest_jobs (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES member(id),
 request_key varchar(64) NOT NULL,
 status varchar(20) NOT NULL, stage varchar(40) NOT NULL,
 error_code varchar(100), generation_id uuid,
 owner_id uuid NOT NULL, lease_until timestamp with time zone NOT NULL,
 created_at timestamp with time zone NOT NULL, finished_at timestamp with time zone,
 updated_at timestamp with time zone NOT NULL,
 CONSTRAINT ck_quest_job_status CHECK(status IN ('RUNNING','READY','FAILED'))
);
CREATE INDEX idx_quest_job_member ON ai_quest_jobs(member_id,created_at DESC);
