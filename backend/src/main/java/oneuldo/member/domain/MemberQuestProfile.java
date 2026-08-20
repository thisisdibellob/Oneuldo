package oneuldo.member.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import oneuldo.global.entity.BaseTimeEntity;
import oneuldo.quest.domain.QuestDifficulty;

@Entity
@Table(name = "member_quest_profiles")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberQuestProfile extends BaseTimeEntity {

    @Id
    private UUID memberId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "preferred_difficulty", nullable = false, length = 20)
    private QuestDifficulty preferredDifficulty;

    @Enumerated(EnumType.STRING)
    @Column(name = "support_level", nullable = false, length = 20)
    private SupportLevel supportLevel;

    @Column(name = "preferred_session_minutes", nullable = false)
    private int preferredSessionMinutes;

    @Column(name = "daily_quest_limit", nullable = false)
    private int dailyQuestLimit;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(
            name = "member_preferred_quest_subcategories",
            joinColumns = @JoinColumn(name = "member_id")
    )
    @Column(name = "subcategory_code", nullable = false, length = 50)
    private Set<String> preferredSubcategoryCodes = new HashSet<>();

    public MemberQuestProfile(
            Member member,
            QuestDifficulty preferredDifficulty,
            SupportLevel supportLevel,
            int preferredSessionMinutes,
            int dailyQuestLimit,
            Set<String> preferredSubcategoryCodes
    ) {
        if (preferredSessionMinutes <= 0) {
            throw new IllegalArgumentException("선호 수행 시간은 1분 이상이어야 합니다.");
        }
        if (dailyQuestLimit <= 0) {
            throw new IllegalArgumentException("하루 퀘스트 제한은 1개 이상이어야 합니다.");
        }

        this.member = member;
        this.preferredDifficulty = preferredDifficulty;
        this.supportLevel = supportLevel;
        this.preferredSessionMinutes = preferredSessionMinutes;
        this.dailyQuestLimit = dailyQuestLimit;
        this.preferredSubcategoryCodes = new HashSet<>(preferredSubcategoryCodes);
    }

    public static MemberQuestProfile defaultFor(Member member) {
        return new MemberQuestProfile(
                member,
                QuestDifficulty.EASY,
                SupportLevel.GUIDED,
                15,
                3,
                Set.of()
        );
    }

    public boolean prefers(String subcategoryCode) {
        return preferredSubcategoryCodes.contains(subcategoryCode);
    }
}
