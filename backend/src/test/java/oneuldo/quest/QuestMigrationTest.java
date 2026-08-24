package oneuldo.quest;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

// Flyway 전체 이력과 JPA Entity 구조가 함께 적용되는지 확인한다.
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:oneuldo-migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.flyway.enabled=true",
        // 테스트 전용 TestRecord Entity는 Flyway 대상이 아니므로 스키마 검증은 분리한다.
        "spring.jpa.hibernate.ddl-auto=none"
})
class QuestMigrationTest {

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void 전체_마이그레이션을_적용할_수_있다() {
        for (String difficulty : new String[]{"VERY_EASY", "EASY", "NORMAL", "HARD", "VERY_HARD"}) {
            assertEquals(10, count("""
                    SELECT COUNT(*) FROM quests q
                    JOIN quest_subcategories s ON s.id = q.subcategory_id
                    WHERE s.code = 'PUBLIC_TRANSPORT' AND q.difficulty = ? AND q.active = TRUE
                    """, difficulty));
            assertEquals(5, count("""
                    SELECT COUNT(*) FROM quests q
                    JOIN quest_subcategories s ON s.id = q.subcategory_id
                    WHERE s.code = 'PUBLIC_TRANSPORT' AND q.difficulty = ?
                      AND q.code LIKE '%SUBWAY%' AND q.active = TRUE
                    """, difficulty));
        }

        assertEquals(0, count("""
                SELECT COUNT(*) FROM (
                    SELECT q.id, q.difficulty, COUNT(s.id) AS step_count
                    FROM quests q
                    JOIN quest_subcategories sc ON sc.id = q.subcategory_id
                    JOIN quest_steps s ON s.quest_id = q.id
                    WHERE sc.code = 'PUBLIC_TRANSPORT' AND q.active = TRUE
                    GROUP BY q.id, q.difficulty
                ) counts
                WHERE step_count < CASE difficulty
                    WHEN 'VERY_EASY' THEN 2 WHEN 'EASY' THEN 3 WHEN 'NORMAL' THEN 4
                    WHEN 'HARD' THEN 5 ELSE 6 END
                   OR step_count > CASE difficulty
                    WHEN 'VERY_EASY' THEN 3 WHEN 'EASY' THEN 4 WHEN 'NORMAL' THEN 5
                    WHEN 'HARD' THEN 6 ELSE 7 END
                """));

        // V13 자동 생성 퀘스트도 교통수단 공통 문장이 아니라 각 퀘스트 고유 목표를 사용한다.
        assertEquals(0, count("""
                SELECT COUNT(*) FROM quest_steps s
                JOIN quests q ON q.id = s.quest_id
                WHERE CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
                  AND (s.instruction LIKE '%지금은%'
                    OR s.situation LIKE '%지금은%')
                """));
        assertEquals(0, count("""
                SELECT COUNT(*) FROM quest_choices c
                JOIN quest_steps s ON s.id = c.step_id
                JOIN quests q ON q.id = s.quest_id
                WHERE CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
                  AND c.label LIKE '%퀘스트%'
                """));
        assertEquals(0, count("""
                SELECT COUNT(*) FROM (
                    SELECT s.quest_id, COUNT(*) step_count, COUNT(DISTINCT s.situation) situation_count
                    FROM quest_steps s
                    JOIN quests q ON q.id = s.quest_id
                    WHERE CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
                    GROUP BY s.quest_id
                ) generated
                WHERE step_count <> situation_count
                """));
        assertEquals(0, count("""
                SELECT COUNT(*) FROM (
                    SELECT c.step_id, COUNT(*) wrong_count, COUNT(DISTINCT c.label) wrong_label_count
                    FROM quest_choices c
                    JOIN quest_steps s ON s.id = c.step_id
                    JOIN quests q ON q.id = s.quest_id
                    WHERE CAST(q.id AS VARCHAR) LIKE '31000000-0000-0000-0000-%'
                      AND c.correct = FALSE
                    GROUP BY c.step_id
                ) generated
                WHERE wrong_count <> wrong_label_count
                """));
        assertEquals(0, count("""
                SELECT COUNT(*) FROM quest_steps s
                JOIN quests q ON q.id = s.quest_id
                WHERE q.code = 'SUBWAY_PREPARE_TRANSIT_CARD_VE'
                  AND (s.instruction LIKE '%노선과 방면%'
                    OR EXISTS (
                        SELECT 1 FROM quest_choices c
                        WHERE c.step_id = s.id AND c.label LIKE '%노선과 목적지 방면%'
                    ))
                """));
        assertEquals(0, count("""
                SELECT COUNT(*) FROM quest_steps s
                JOIN quests q ON q.id = s.quest_id
                WHERE q.code = 'BUS_MATCH_NUMBER_VE'
                  AND s.instruction NOT LIKE '%버스의 번호%'
                """));

        assertEquals(0, count("""
                SELECT COUNT(*) FROM (
                    SELECT q.difficulty, s.id, COUNT(c.id) AS choice_count
                    FROM quests q
                    JOIN quest_subcategories sc ON sc.id = q.subcategory_id
                    JOIN quest_steps s ON s.quest_id = q.id
                    JOIN quest_choices c ON c.step_id = s.id
                    WHERE sc.code = 'PUBLIC_TRANSPORT' AND q.active = TRUE
                    GROUP BY q.difficulty, s.id
                ) counts
                WHERE choice_count < CASE difficulty
                    WHEN 'VERY_EASY' THEN 2 WHEN 'EASY' THEN 2 WHEN 'NORMAL' THEN 3
                    WHEN 'HARD' THEN 3 ELSE 4 END
                   OR choice_count > CASE difficulty
                    WHEN 'VERY_EASY' THEN 3 WHEN 'EASY' THEN 3 WHEN 'NORMAL' THEN 4
                    WHEN 'HARD' THEN 4 ELSE 5 END
                """));
    }

    private int count(String sql, Object... arguments) {
        return jdbcTemplate.queryForObject(sql, Integer.class, arguments);
    }
}
