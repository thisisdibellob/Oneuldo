DROP INDEX IF EXISTS uq_market_recommendation_member_analysis_input;

CREATE UNIQUE INDEX uq_market_recommendation_member_ai_profile
    ON market_difficulty_recommendations(member_id, profile_id);
