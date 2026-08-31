DELETE FROM quest_skill_requirements
WHERE quest_id IN (
    SELECT id
    FROM quests
    WHERE code = 'SHOP_AT_MARKET'
);

INSERT INTO quest_skill_requirements (quest_id, skill_code)
SELECT quest.id, mapping.skill_code
FROM quests quest
JOIN (VALUES
    ('SHOP_AT_MARKET', 'LANGUAGE_COMPREHENSION'),
    ('SHOP_AT_MARKET', 'NUMERACY'),
    ('SHOP_AT_MARKET', 'MONEY_MANAGEMENT')
) AS mapping(quest_code, skill_code)
    ON mapping.quest_code = quest.code;
