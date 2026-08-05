package oneuldo.database;

import org.springframework.data.jpa.repository.JpaRepository;

// TestRecord Entity의 저장·조회·삭제 기능을 제공한다.
public interface TestRecordRepository extends JpaRepository<TestRecord, Long> {
}
