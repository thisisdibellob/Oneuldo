package oneuldo.simulationquest.llm.input;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import oneuldo.behaviorlog.normalization.domain.ValidityStatus;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.BehaviorPatternProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SafetyProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SkillPerformanceProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SupportProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ValidityProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberQuestProfile;
import oneuldo.member.domain.SupportLevel;
import oneuldo.member.repository.MemberQuestProfileRepository;
import oneuldo.member.repository.MemberRepository;
import oneuldo.place.domain.Place;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.domain.QuestDifficulty;
import oneuldo.quest.domain.QuestSubcategory;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.dto.payload.SimulationType;
import oneuldo.simulationquest.dto.payload.conversation.ConversationSimulationPayload;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.PersonalizationMode;
import oneuldo.simulationquest.repository.SimulationQuestRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LlmSimulationInputServiceTest {

    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final MemberQuestProfileRepository preferenceRepository =
            mock(MemberQuestProfileRepository.class);
    private final BehaviorProfileSnapshotRepository profileRepository =
            mock(BehaviorProfileSnapshotRepository.class);
    private final SimulationQuestRepository simulationRepository =
            mock(SimulationQuestRepository.class);
    private final UUID memberId = UUID.randomUUID();
    private final UUID simulationId = UUID.randomUUID();

    private LlmSimulationInputService service;
    private MemberQuestProfile preferences;

    @BeforeEach
    void setUp() {
        service = new LlmSimulationInputService(
                memberRepository,
                preferenceRepository,
                profileRepository,
                simulationRepository,
                Duration.ofDays(30)
        );
        Member member = mock(Member.class);
        preferences = mock(MemberQuestProfile.class);
        when(memberRepository.findById(memberId)).thenReturn(Optional.of(member));
        when(preferenceRepository.findByMemberId(memberId)).thenReturn(Optional.of(preferences));
        when(preferences.getPreferredDifficulty()).thenReturn(QuestDifficulty.EASY);
        when(preferences.getSupportLevel()).thenReturn(SupportLevel.GUIDED);
        when(preferences.getPreferredSessionMinutes()).thenReturn(15);
        when(preferences.getPreferredSubcategoryCodes()).thenReturn(Set.of("DAILY_LIFE"));
        SimulationQuest simulation = simulation();
        when(simulationRepository.findActiveInputTemplateById(simulationId))
                .thenReturn(Optional.of(simulation));
    }

    @Test
    void usesPreferencesAndAssessmentPriorityWhenProfileDoesNotExist() {
        when(profileRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId))
                .thenReturn(Optional.empty());

        LlmSimulationGenerationInput input = service.build(memberId, simulationId);

        assertThat(input.schemaVersion()).isEqualTo("simulation-generation-input-v1");
        assertThat(input.quest().targetSkillCodes()).containsExactly("FUNCTIONAL_COMMUNICATION");
        assertThat(input.profile().available()).isFalse();
        assertThat(input.generationPlan().personalizationMode())
                .isEqualTo(PersonalizationMode.NO_PROFILE);
        assertThat(input.generationPlan().supportLevel()).isEqualTo(SupportLevel.GUIDED);
        assertThat(input.generationPlan().assessmentPriority()).isTrue();
        assertThat(input.generationPlan().maxChoicesPerStep()).isEqualTo(3);
    }

    @Test
    void convertsLowTargetSkillPerformanceAndSafetyConcernIntoConservativePlan() {
        when(preferences.getSupportLevel()).thenReturn(SupportLevel.INDEPENDENT);
        BehaviorProfileData data = profileData();
        BehaviorProfileSnapshot snapshot = mock(BehaviorProfileSnapshot.class);
        when(snapshot.getProfileData()).thenReturn(data);
        when(snapshot.getGeneratedAt()).thenReturn(data.generatedAt());
        when(profileRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId))
                .thenReturn(Optional.of(snapshot));

        LlmSimulationGenerationInput input = service.build(memberId, simulationId);

        assertThat(input.generationPlan().personalizationMode())
                .isEqualTo(PersonalizationMode.BEHAVIOR_INFORMED);
        assertThat(input.generationPlan().supportLevel()).isEqualTo(SupportLevel.STEP_BY_STEP);
        assertThat(input.generationPlan().timePressureAllowed()).isFalse();
        assertThat(input.generationPlan().hazardousDistractorsAllowed()).isFalse();
        assertThat(input.generationPlan().mandatorySafetyGuidance()).isTrue();
        assertThat(input.generationPlan().decisionReasons())
                .contains("TARGET_SKILL_SUCCESS_BELOW_50_PERCENT", "OBSERVED_SAFETY_CONCERN");
    }

    @Test
    void treatsRecentlyGeneratedSnapshotWithOldEvidenceAsStale() {
        BehaviorProfileData data = profileData(Instant.now().minus(Duration.ofDays(31)));
        BehaviorProfileSnapshot snapshot = mock(BehaviorProfileSnapshot.class);
        when(snapshot.getProfileData()).thenReturn(data);
        when(snapshot.getGeneratedAt()).thenReturn(data.generatedAt());
        when(profileRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId))
                .thenReturn(Optional.of(snapshot));

        LlmSimulationGenerationInput input = service.build(memberId, simulationId);

        assertThat(input.profile().stale()).isTrue();
        assertThat(input.generationPlan().personalizationMode())
                .isEqualTo(PersonalizationMode.STALE_PROFILE);
    }

    private SimulationQuest simulation() {
        SimulationQuest simulation = mock(SimulationQuest.class);
        Quest quest = mock(Quest.class);
        QuestSubcategory subcategory = mock(QuestSubcategory.class);
        Place place = mock(Place.class);
        var payload = new ConversationSimulationPayload(List.of("STAFF"), "도움을 요청한다.");
        when(simulation.getQuest()).thenReturn(quest);
        when(simulation.getPlace()).thenReturn(place);
        when(simulation.getType()).thenReturn(SimulationType.CONVERSATION);
        when(simulation.getPayload()).thenReturn(payload);
        when(quest.getRequiredSkillCodes()).thenReturn(Set.of("FUNCTIONAL_COMMUNICATION"));
        when(quest.getCode()).thenReturn("ORDER_AT_CAFE");
        when(quest.getSubcategory()).thenReturn(subcategory);
        when(quest.getTitle()).thenReturn("카페에서 주문하기");
        when(quest.getGoal()).thenReturn("직원에게 원하는 메뉴를 말한다.");
        when(quest.getDifficulty()).thenReturn(QuestDifficulty.EASY);
        when(subcategory.getCode()).thenReturn("DAILY_LIFE");
        when(place.getCode()).thenReturn("CAFE");
        when(place.getName()).thenReturn("카페");
        return simulation;
    }

    private BehaviorProfileData profileData() {
        return profileData(Instant.now());
    }

    private BehaviorProfileData profileData(Instant evidenceTo) {
        Instant now = Instant.now();
        SkillPerformanceProfile skill = new SkillPerformanceProfile(
                "FUNCTIONAL_COMMUNICATION",
                40.0,
                70.0,
                6,
                2,
                0,
                8,
                0,
                2,
                2,
                2,
                ConfidenceLevel.MEDIUM,
                List.of(),
                List.of(),
                List.of()
        );
        return new BehaviorProfileData(
                "behavior-profile-v1",
                "behavior-profile-policy-v1",
                "behavior-normalizer-v1",
                "behavior-event-registry-v1",
                "behavior-measurement-rules-v1",
                Map.of(skill.skillCode(), skill),
                new SupportProfile(List.of(), 1.0, 2, 1000L, 1),
                List.of(),
                new SafetyProfile(SafetyStatus.RED, 1, 0, 0, List.of(), true),
                new ValidityProfile(
                        10, 0, 0, Map.of(ValidityStatus.VALID, 10),
                        Map.of(), 0, 0, 0.0),
                new BehaviorPatternProfile(null, null, 0, null, null, Map.of()),
                Set.of(),
                List.of(),
                evidenceTo.minus(Duration.ofDays(7)),
                evidenceTo,
                now
        );
    }
}
