package oneuldo.quest.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import oneuldo.quest.domain.UserSubcategoryDifficulty;

public interface UserSubcategoryDifficultyRepository
        extends JpaRepository<UserSubcategoryDifficulty, UUID> {

    Optional<UserSubcategoryDifficulty> findByMemberIdAndSubcategoryId(
            UUID memberId,
            UUID subcategoryId
    );

    List<UserSubcategoryDifficulty> findAllByMemberId(UUID memberId);
}
