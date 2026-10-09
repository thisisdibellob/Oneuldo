ALTER TABLE market_difficulty_recommendations
    DROP CONSTRAINT ck_market_recommendation_item_count;

ALTER TABLE market_difficulty_recommendations
    ADD CONSTRAINT ck_market_recommendation_item_count
        CHECK (item_count BETWEEN 1 AND 4);
