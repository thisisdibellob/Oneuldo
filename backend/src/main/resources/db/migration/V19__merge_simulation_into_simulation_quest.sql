ALTER TABLE simulations RENAME TO simulation_quests;

ALTER INDEX idx_simulations_quest_active
    RENAME TO idx_simulation_quests_quest_active;

ALTER TABLE simulation_quests
    ADD COLUMN simulation_type VARCHAR(30);

ALTER TABLE simulation_quests
    ADD COLUMN payload JSONB;

ALTER TABLE simulation_quests
    ADD COLUMN dialogues JSONB NOT NULL DEFAULT CAST('[]' AS JSONB);

UPDATE simulation_quests
SET simulation_type = 'CONVERSATION',
    payload = CAST(
        '{"type":"CONVERSATION","participantIds":[],"objective":"대화를 통해 퀘스트 목표를 수행한다."}'
        AS JSONB
    );

UPDATE simulation_quests
SET simulation_type = 'TRANSIT',
    payload = CAST(
        '{"type":"TRANSIT","origin":{"code":"BUS_STOP","name":"버스 정류장"},"destination":{"code":"DESTINATION","name":"목적지"},"routes":[],"correctRouteCode":"","boardingStopCode":"BUS_STOP","exitStopCode":"DESTINATION","fare":0}'
        AS JSONB
    )
WHERE place_id IN (
    SELECT id FROM places WHERE code = 'BUS_STOP'
);

UPDATE simulation_quests
SET simulation_type = 'SHOPPING',
    payload = CAST(
        '{"type":"SHOPPING","budget":0,"currency":"KRW","objectives":[],"categories":[],"products":[]}'
        AS JSONB
    )
WHERE place_id IN (
    SELECT id FROM places WHERE code = 'MARKET'
);

ALTER TABLE simulation_quests
    ALTER COLUMN simulation_type SET NOT NULL;

ALTER TABLE simulation_quests
    ALTER COLUMN payload SET NOT NULL;

ALTER TABLE simulation_quests
    ADD CONSTRAINT chk_simulation_quest_type
        CHECK (simulation_type IN ('SHOPPING', 'TRANSIT', 'COOKING', 'CONVERSATION'));
