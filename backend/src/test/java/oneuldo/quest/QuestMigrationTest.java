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
        assertEquals(2, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM quests
                WHERE code IN ('BOARD_SUBWAY_SAFELY', 'TRANSFER_SUBWAY_SAFELY')
                """, Integer.class));
        assertEquals(8, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM quest_steps s
                JOIN quests q ON q.id = s.quest_id
                WHERE q.code IN ('BOARD_SUBWAY_SAFELY', 'TRANSFER_SUBWAY_SAFELY')
                """, Integer.class));
        assertEquals(24, jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM quest_choices c
                JOIN quest_steps s ON s.id = c.step_id
                JOIN quests q ON q.id = s.quest_id
                WHERE q.code IN ('BOARD_SUBWAY_SAFELY', 'TRANSFER_SUBWAY_SAFELY')
                """, Integer.class));
    }
}
