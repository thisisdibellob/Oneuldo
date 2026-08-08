package oneuldo.database;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

// 실제 Spring 환경과 테스트용 H2 데이터베이스를 실행한다.
@SpringBootTest
// 테스트 종료 후 저장한 데이터를 되돌린다.
@Transactional
class JpaSaveAndFindTests {

    private final TestRecordRepository repository;

    // Spring이 생성한 Repository를 테스트 클래스에 주입한다.
    @Autowired
    JpaSaveAndFindTests(TestRecordRepository repository) {
        this.repository = repository;
    }

    @Test
    void 데이터를_저장하고_조회할_수_있다() {
        TestRecord saved = repository.save(new TestRecord("JPA 연결 확인"));

        TestRecord found = repository.findById(saved.getId())
                .orElseThrow();

        assertNotNull(found.getId());
        assertEquals("JPA 연결 확인", found.getName());

        assertNotNull(found.getCreatedAt());
        assertNotNull(found.getUpdatedAt());
    }
}
