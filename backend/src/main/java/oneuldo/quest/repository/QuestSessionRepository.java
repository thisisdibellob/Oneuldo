package oneuldo.quest.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestSession;

public interface QuestSessionRepository extends JpaRepository<QuestSession, UUID> {

    // 세션 소유자까지 함께 확인한다.
    Optional<QuestSession> findByIdAndMemberId(UUID sessionId, UUID memberId);

    long countByMemberIdAndQuestSubcategoryId(UUID memberId, UUID subcategoryId);

    // 현재 권장 난이도에서 가장 최근에 종료된 세션만 평가 표본으로 읽는다.
    @Query("""
            SELECT session
            FROM QuestSession session
            JOIN FETCH session.quest quest
            WHERE session.member.id = :memberId
              AND quest.subcategory.id = :subcategoryId
              AND session.questDifficulty = :difficulty
              AND session.status <> oneuldo.quest.domain.QuestSessionStatus.IN_PROGRESS
            ORDER BY COALESCE(session.completedAt, session.abandonedAt) DESC
            """)
    List<QuestSession> findRecentTerminalSessions(
            @Param("memberId") UUID memberId,
            @Param("subcategoryId") UUID subcategoryId,
            @Param("difficulty") QuestDifficulty difficulty,
            Pageable pageable
    );
}
