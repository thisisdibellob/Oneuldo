package oneuldo.simulationquest.llm.input;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import oneuldo.behaviorlog.domain.type.SafetyStatus;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.EvidenceGap;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ObservedEvidenceSummary;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.SkillPerformanceProfile;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileSnapshot;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.global.exception.MemberNotFoundException;
import oneuldo.member.domain.MemberQuestProfile;
import oneuldo.member.domain.SupportLevel;
import oneuldo.member.repository.MemberQuestProfileRepository;
import oneuldo.member.repository.MemberRepository;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.dto.payload.SimulationPayload;
import oneuldo.simulationquest.dto.payload.conversation.ConversationSimulationPayload;
import oneuldo.simulationquest.dto.payload.cooking.CookingSimulationPayload;
import oneuldo.simulationquest.dto.payload.shopping.ShoppingSimulationPayload;
import oneuldo.simulationquest.dto.payload.transit.TransitSimulationPayload;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.BehaviorSignal;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.ContentContext;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.DataQualitySignal;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.GenerationPlan;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.InstructionGranularity;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.PersonalizationMode;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.PreferenceContext;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.ProfileContext;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.QuestContext;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.SafetySignal;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.SkillSignal;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.SupportSignal;
import oneuldo.simulationquest.repository.SimulationQuestRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LlmSimulationInputService {

    public static final String INPUT_SCHEMA_VERSION = "simulation-generation-input-v1";
    private static final double ADDITIONAL_SUPPORT_THRESHOLD_PERCENT = 50.0;

    private final MemberRepository memberRepository;
    private final MemberQuestProfileRepository preferenceRepository;
    private final BehaviorProfileSnapshotRepository profileRepository;
    private final SimulationQuestRepository simulationRepository;
    private final Duration profileMaxAge;

    public LlmSimulationInputService(
            MemberRepository memberRepository,
            MemberQuestProfileRepository preferenceRepository,
            BehaviorProfileSnapshotRepository profileRepository,
            SimulationQuestRepository simulationRepository,
            @Value("${behavior-profile.llm-input.max-age:P30D}") Duration profileMaxAge
    ) {
        this.memberRepository = memberRepository;
        this.preferenceRepository = preferenceRepository;
        this.profileRepository = profileRepository;
        this.simulationRepository = simulationRepository;
        this.profileMaxAge = profileMaxAge;
    }

    @Transactional(readOnly = true)
    public LlmSimulationGenerationInput build(UUID memberId, UUID simulationTemplateId) {
        var member = memberRepository.findById(memberId)
                .orElseThrow(MemberNotFoundException::new);
        MemberQuestProfile preferences = preferenceRepository.findByMemberId(memberId)
                .orElseGet(() -> MemberQuestProfile.defaultFor(member));
        SimulationQuest simulation = simulationRepository
                .findActiveInputTemplateById(simulationTemplateId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "사용 가능한 시뮬레이션 템플릿을 찾을 수 없습니다."));
        BehaviorProfileSnapshot snapshot = profileRepository
                .findFirstByMemberIdOrderByGeneratedAtDesc(memberId).orElse(null);

        Set<String> targetSkills = new TreeSet<>(
                simulation.getQuest().getRequiredSkillCodes());
        if (targetSkills.isEmpty()) {
            throw new IllegalStateException(
                    "퀘스트 기술 매핑이 없습니다: " + simulation.getQuest().getCode());
        }
        ProfileContext profile = profileContext(snapshot, targetSkills, Instant.now());
        GenerationPlan plan = generationPlan(
                simulation, preferences, profile, targetSkills);

        return new LlmSimulationGenerationInput(
                INPUT_SCHEMA_VERSION,
                new QuestContext(
                        simulation.getQuest().getCode(),
                        simulation.getQuest().getSubcategory().getCode(),
                        simulation.getQuest().getTitle(),
                        simulation.getQuest().getGoal(),
                        simulation.getQuest().getDifficulty(),
                        Set.copyOf(targetSkills)
                ),
                new ContentContext(
                        simulation.getType(),
                        simulation.getPlace().getCode(),
                        simulation.getPlace().getName(),
                        simulation.getPayload(),
                        allowedAssetCodes(simulation.getPayload())
                ),
                new PreferenceContext(
                        preferences.getPreferredDifficulty(),
                        preferences.getSupportLevel(),
                        preferences.getPreferredSessionMinutes(),
                        Set.copyOf(preferences.getPreferredSubcategoryCodes())
                ),
                profile,
                plan
        );
    }

    private ProfileContext profileContext(BehaviorProfileSnapshot snapshot,
            Set<String> targetSkills, Instant now) {
        if (snapshot == null) return emptyProfile(targetSkills);
        BehaviorProfileData data = snapshot.getProfileData();
        boolean stale = data.evidenceTo().plus(profileMaxAge).isBefore(now);
        List<SkillSignal> skills = targetSkills.stream()
                .map(skill -> skillSignal(skill, data))
                .toList();
        var support = data.supportProfile();
        var safety = data.safetyProfile();
        var validity = data.validityProfile();
        Set<String> relevantGaps = new TreeSet<>(data.needsMoreAssessment());
        relevantGaps.retainAll(targetSkills);
        return new ProfileContext(
                true,
                stale,
                data.profileVersion(),
                data.generatedAt(),
                data.evidenceFrom(),
                data.evidenceTo(),
                skills,
                new SupportSignal(
                        support.averagePromptLevel(),
                        support.totalSupportCount(),
                        support.medianHelpRequestLatencyMs(),
                        support.supportedSessionCount()
                ),
                new SafetySignal(
                        safety.overallStatus(),
                        safety.redEventCount(),
                        safety.yellowEventCount(),
                        safety.nearMissCount(),
                        safety.professionalReviewRecommended()
                ),
                new DataQualitySignal(
                        validity.excludedEventRate(),
                        validity.openSessionCount(),
                        validity.gappedSessionCount(),
                        Set.copyOf(relevantGaps)
                )
        );
    }

    private ProfileContext emptyProfile(Set<String> targetSkills) {
        List<SkillSignal> emptySkills = targetSkills.stream()
                .map(skill -> new SkillSignal(
                        skill, null, null, 0, 0, ConfidenceLevel.INSUFFICIENT,
                        List.of(), List.of(),
                        List.of(BehaviorProfileData.EvidenceGapType.NO_ASSESSMENT_EVIDENCE)))
                .toList();
        return new ProfileContext(
                false, false, null, null, null, null,
                emptySkills,
                new SupportSignal(null, null, null, 0),
                new SafetySignal(null, 0, 0, 0, false),
                new DataQualitySignal(null, 0, 0, Set.copyOf(targetSkills))
        );
    }

    private SkillSignal skillSignal(String skillCode, BehaviorProfileData data) {
        SkillPerformanceProfile skill = data.skills().get(skillCode);
        List<BehaviorProfileData.EvidenceGapType> gaps = data.evidenceGaps().stream()
                .filter(gap -> gap.skillCode().equals(skillCode))
                .map(EvidenceGap::type).distinct().toList();
        if (skill == null) {
            return new SkillSignal(
                    skillCode, null, null, 0, 0, ConfidenceLevel.INSUFFICIENT,
                    List.of(), List.of(), gaps.isEmpty()
                            ? List.of(BehaviorProfileData.EvidenceGapType.NO_ASSESSMENT_EVIDENCE)
                            : gaps);
        }
        return new SkillSignal(
                skillCode,
                skill.independentSuccessRate(),
                skill.supportedSuccessRate(),
                skill.independentEvaluableEvidenceCount(),
                skill.supportedEvaluableEvidenceCount(),
                skill.confidence(),
                skill.observedStrengths().stream().map(this::behaviorSignal).toList(),
                skill.observedDifficulties().stream().map(this::behaviorSignal).toList(),
                gaps
        );
    }

    private BehaviorSignal behaviorSignal(ObservedEvidenceSummary source) {
        return new BehaviorSignal(
                source.eventCode(), source.outcome(), source.independenceLevel(),
                source.errorType(), source.observationCount());
    }

    private GenerationPlan generationPlan(SimulationQuest simulation,
            MemberQuestProfile preferences, ProfileContext profile, Set<String> targetSkills) {
        List<String> reasons = new ArrayList<>();
        PersonalizationMode mode = personalizationMode(profile);
        reasons.add("PERSONALIZATION_" + mode.name());

        SupportLevel inferredSupport = switch (mode) {
            case NO_PROFILE, STALE_PROFILE, INSUFFICIENT_EVIDENCE -> preferences.getSupportLevel();
            case BEHAVIOR_INFORMED -> behaviorSupport(profile.selectedSkills(), reasons);
        };
        SupportLevel support = moreSupportive(preferences.getSupportLevel(), inferredSupport);
        if (support != inferredSupport) reasons.add("PREFERENCE_SUPPORT_FLOOR");

        SafetyStatus safety = profile.safety().overallStatus();
        boolean safetyConcern = safety == SafetyStatus.RED || safety == SafetyStatus.YELLOW;
        if (safetyConcern) reasons.add("OBSERVED_SAFETY_CONCERN");
        boolean assessmentPriority = mode != PersonalizationMode.BEHAVIOR_INFORMED
                || !profile.dataQuality().skillsNeedingMoreAssessment().isEmpty();
        if (assessmentPriority) reasons.add("MORE_EVIDENCE_NEEDED");

        int maxTaskSteps = Math.max(3, Math.min(8,
                (int) Math.ceil(preferences.getPreferredSessionMinutes() / 3.0)));
        return new GenerationPlan(
                mode,
                simulation.getQuest().getDifficulty(),
                Set.copyOf(targetSkills),
                support,
                granularity(support),
                maxTaskSteps,
                maxChoices(support),
                hintLevel(support),
                support == SupportLevel.INDEPENDENT && !safetyConcern,
                !safetyConcern,
                safetyConcern,
                assessmentPriority,
                List.copyOf(reasons)
        );
    }

    private PersonalizationMode personalizationMode(ProfileContext profile) {
        if (!profile.available()) return PersonalizationMode.NO_PROFILE;
        if (profile.stale()) return PersonalizationMode.STALE_PROFILE;
        boolean usable = profile.selectedSkills().stream()
                .anyMatch(skill -> skill.confidence() == ConfidenceLevel.MEDIUM
                        || skill.confidence() == ConfidenceLevel.HIGH);
        return usable ? PersonalizationMode.BEHAVIOR_INFORMED
                : PersonalizationMode.INSUFFICIENT_EVIDENCE;
    }

    private SupportLevel behaviorSupport(List<SkillSignal> skills, List<String> reasons) {
        boolean lowPerformance = skills.stream()
                .filter(skill -> skill.confidence() == ConfidenceLevel.MEDIUM
                        || skill.confidence() == ConfidenceLevel.HIGH)
                .map(this::bestObservedRate)
                .anyMatch(rate -> rate != null
                        && rate < ADDITIONAL_SUPPORT_THRESHOLD_PERCENT);
        if (lowPerformance) {
            reasons.add("TARGET_SKILL_SUCCESS_BELOW_50_PERCENT");
            return SupportLevel.STEP_BY_STEP;
        }
        boolean gaps = skills.stream().anyMatch(skill -> !skill.evidenceGaps().isEmpty());
        if (gaps) {
            reasons.add("TARGET_SKILL_EVIDENCE_GAP");
            return SupportLevel.GUIDED;
        }
        reasons.add("TARGET_SKILL_EVIDENCE_STABLE");
        return SupportLevel.INDEPENDENT;
    }

    private Double bestObservedRate(SkillSignal skill) {
        return skill.independentSuccessRate() != null
                ? skill.independentSuccessRate() : skill.supportedSuccessRate();
    }

    private SupportLevel moreSupportive(SupportLevel left, SupportLevel right) {
        return left.ordinal() >= right.ordinal() ? left : right;
    }

    private InstructionGranularity granularity(SupportLevel support) {
        return switch (support) {
            case INDEPENDENT -> InstructionGranularity.COMPLETE_TASK;
            case GUIDED -> InstructionGranularity.ONE_STEP;
            case STEP_BY_STEP -> InstructionGranularity.ONE_ACTION;
        };
    }

    private int maxChoices(SupportLevel support) {
        return switch (support) {
            case INDEPENDENT -> 4;
            case GUIDED -> 3;
            case STEP_BY_STEP -> 2;
        };
    }

    private int hintLevel(SupportLevel support) {
        return switch (support) {
            case INDEPENDENT -> 0;
            case GUIDED -> 1;
            case STEP_BY_STEP -> 2;
        };
    }

    private Set<String> allowedAssetCodes(SimulationPayload payload) {
        Set<String> codes = new TreeSet<>();
        if (payload instanceof ShoppingSimulationPayload shopping) {
            shopping.products().stream().map(product -> product.assetCode())
                    .filter(code -> code != null && !code.isBlank()).forEach(codes::add);
        } else if (payload instanceof CookingSimulationPayload cooking) {
            cooking.ingredients().stream().map(ingredient -> ingredient.assetCode())
                    .filter(code -> code != null && !code.isBlank()).forEach(codes::add);
            cooking.requiredToolCodes().stream()
                    .filter(code -> code != null && !code.isBlank()).forEach(codes::add);
        } else if (payload instanceof TransitSimulationPayload transit) {
            transit.routes().stream().map(route -> route.routeCode())
                    .filter(code -> code != null && !code.isBlank()).forEach(codes::add);
            if (transit.origin() != null) codes.add(transit.origin().code());
            if (transit.destination() != null) codes.add(transit.destination().code());
        } else if (payload instanceof ConversationSimulationPayload conversation) {
            conversation.participantIds().stream()
                    .filter(code -> code != null && !code.isBlank()).forEach(codes::add);
        }
        return Set.copyOf(codes);
    }
}
