package oneuldo.behaviorlog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.domain.BehaviorLogBatchRequest;
import oneuldo.behaviorlog.domain.BehaviorLogIngestStatus;
import oneuldo.behaviorlog.domain.BehaviorLogRequest;
import oneuldo.behaviorlog.domain.context.AccessibilityContext;
import oneuldo.behaviorlog.domain.context.ActionContext;
import oneuldo.behaviorlog.domain.context.EventMetadata;
import oneuldo.behaviorlog.domain.context.IdentityContext;
import oneuldo.behaviorlog.domain.context.SessionEndContext;
import oneuldo.behaviorlog.domain.context.TaskContext;
import oneuldo.behaviorlog.domain.context.TaskResultContext;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
import oneuldo.behaviorlog.domain.type.ControllerMode;
import oneuldo.behaviorlog.domain.type.EvidenceContext;
import oneuldo.behaviorlog.domain.type.InstructionMode;
import oneuldo.behaviorlog.domain.type.SessionEndReason;
import oneuldo.behaviorlog.domain.type.StepOutcome;
import oneuldo.behaviorlog.domain.type.TextLevel;
import oneuldo.behaviorlog.normalization.domain.EvidenceDirection;
import oneuldo.behaviorlog.normalization.domain.SessionIntegrityStatus;
import oneuldo.behaviorlog.normalization.repository.BehaviorSessionIntegrityRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEvidenceRepository;
import oneuldo.behaviorlog.normalization.repository.NormalizedBehaviorEventRepository;
import oneuldo.behaviorlog.normalization.service.BehaviorNormalizationService;
import oneuldo.behaviorlog.personalization.repository.MarketDifficultyRecommendationRepository;
import oneuldo.behaviorlog.personalization.repository.MarketAiQuestGenerationRepository;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.personalization.service.MarketAiQuestAuditService;
import oneuldo.behaviorlog.profile.domain.BehaviorProfileData.ConfidenceLevel;
import oneuldo.behaviorlog.profile.service.BehaviorProfileService;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.behaviorlog.service.BehaviorLogService;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ShoppingBehaviorPilotIntegrationTest {

    private static final UUID MARKET_TASK_ID = UUID.fromString(
            "30000000-0000-0000-0000-000000000003");
    private static final Instant STARTED_AT = Instant.now().minusSeconds(60);

    @Autowired private BehaviorLogService behaviorLogService;
    @Autowired private BehaviorProfileService behaviorProfileService;
    @Autowired private MemberRepository memberRepository;
    @Autowired private BehaviorLogRepository behaviorLogRepository;
    @Autowired private NormalizedBehaviorEventRepository normalizedEventRepository;
    @Autowired private NormalizedBehaviorEvidenceRepository evidenceRepository;
    @Autowired private BehaviorSessionIntegrityRepository integrityRepository;
    @Autowired private BehaviorProfileSnapshotRepository profileSnapshotRepository;
    @Autowired private MarketDifficultyRecommendationRepository recommendationRepository;
    @Autowired private MarketAiQuestGenerationRepository aiGenerationRepository;
    @Autowired private MarketAiQuestAuditService aiQuestAuditService;

    @Test
    void 정상_장보기_배치를_저장하고_정규화한_뒤_프로파일을_생성한다() {
        Member member = memberRepository.save(new Member(
                "market-pilot-" + UUID.randomUUID(),
                "encoded-password",
                "장보기 시범 사용자",
                UUID.randomUUID() + "@example.com",
                MemberRole.CHILD,
                LocalDate.of(2000, 1, 1)
        ));
        UUID sessionId = UUID.randomUUID();
        List<BehaviorLogRequest> events = successfulEvents(sessionId);
        System.out.printf("[BehaviorPilotTest][1/7] GENERATED session=%s codes=%s%n",
                sessionId, events.stream().map(event -> event.action().eventCode()).toList());

        var firstResponse = behaviorLogService.recordBatch(
                member.getId(), new BehaviorLogBatchRequest(UUID.randomUUID(), events));
        assertTrue(firstResponse.events().stream()
                .allMatch(event -> event.status() == BehaviorLogIngestStatus.ACCEPTED));
        assertEquals(8, behaviorLogRepository.findAllByMemberIdOrderByOccurredAtAsc(
                member.getId()).size());
        System.out.printf("[BehaviorPilotTest][2/7] RAW_STORED accepted=%d rawCount=%d%n",
                firstResponse.events().size(), 8);

        var duplicateResponse = behaviorLogService.recordBatch(
                member.getId(), new BehaviorLogBatchRequest(UUID.randomUUID(), events));
        assertTrue(duplicateResponse.events().stream()
                .allMatch(event -> event.status() == BehaviorLogIngestStatus.DUPLICATE));
        assertEquals(8, behaviorLogRepository.findAllByMemberIdOrderByOccurredAtAsc(
                member.getId()).size());
        System.out.printf("[BehaviorPilotTest][3/7] IDEMPOTENT duplicate=%d rawCount=%d%n",
                duplicateResponse.events().size(), 8);

        var normalized = normalizedEventRepository.findProfileInputEvents(
                member.getId(),
                BehaviorNormalizationService.NORMALIZER_VERSION,
                oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry.REGISTRY_VERSION,
                oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry.MEASUREMENT_RULE_VERSION,
                STARTED_AT.minusSeconds(1), STARTED_AT.plusSeconds(20));
        assertEquals(8, normalized.size());
        var normalizedIds = normalized.stream().map(event -> event.getId()).toList();
        var evidence = evidenceRepository.findAllByNormalizedEventIdIn(normalizedIds);
        long positive = evidence.stream()
                .filter(item -> item.getDirection() == EvidenceDirection.POSITIVE).count();
        assertEquals(7, positive);
        System.out.printf("[BehaviorPilotTest][4/7] NORMALIZED events=%d positive=%d neutral=%d%n",
                normalized.size(), positive, evidence.size() - positive);

        var integrity = integrityRepository.findByMemberIdAndSessionId(
                member.getId(), sessionId).orElseThrow();
        assertEquals(SessionIntegrityStatus.COMPLETE, integrity.getStatus());
        assertTrue(integrity.getMissingEventSequences().isEmpty());

        var profile = behaviorProfileService.findLatest(member.getId());
        assertTrue(profileSnapshotRepository.findByMemberIdAndSourceSessionId(
                member.getId(), sessionId).isPresent());
        var skills = profile.profileData().skills();
        assertEquals(100.0, skills.get("LANGUAGE_COMPREHENSION").independentSuccessRate());
        assertEquals(100.0, skills.get("NUMERACY").independentSuccessRate());
        assertEquals(100.0, skills.get("MONEY_MANAGEMENT").independentSuccessRate());
        assertEquals(ConfidenceLevel.LOW, skills.get("LANGUAGE_COMPREHENSION").confidence());
        System.out.printf(
                "[BehaviorPilotTest][5/7] PROFILE session=%s integrity=%s language=%.1f numeracy=%.1f money=%.1f confidence=%s%n",
                sessionId,
                integrity.getStatus(),
                skills.get("LANGUAGE_COMPREHENSION").independentSuccessRate(),
                skills.get("NUMERACY").independentSuccessRate(),
                skills.get("MONEY_MANAGEMENT").independentSuccessRate(),
                skills.get("LANGUAGE_COMPREHENSION").confidence());

        var recommendation = recommendationRepository
                .findFirstByMemberIdOrderByGeneratedAtDesc(member.getId()).orElseThrow();
        assertEquals(2, recommendation.getRecommendedDifficulty());
        assertEquals("INSUFFICIENT_EVIDENCE", recommendation.getPersonalizationMode());
        assertEquals(profile.profileId(), recommendation.getProfileSnapshot().getId());
        System.out.printf(
                "[BehaviorPilotTest][6/7] RECOMMENDATION difficulty=%d mode=%s reasons=%s%n",
                recommendation.getRecommendedDifficulty(),
                recommendation.getPersonalizationMode(),
                recommendation.getReasonCodes());

        UUID generationId = UUID.randomUUID();
        var draft = new MarketAiQuestDraft(
                2, "행동 근거 기반 장보기", "목록에 맞게 물건을 골라요.", 5000,
                List.of(new MarketAiQuestDraft.Objective("milk", 1),
                        new MarketAiQuestDraft.Objective("apple", 1)),
                List.of("목록을 확인해요."), List.of("목록을 볼게요.", "예산을 볼게요."),
                "장보기를 마쳤어요!", "행동 프로파일을 반영했습니다.",
                List.of("PROFILE_APPLIED"));
        var aiResponse = MarketAiQuestResponse.from(
                generationId, "AI", "qwen-test", 120L, "INSUFFICIENT_EVIDENCE",
                "market-ai-quest-v1", draft);
        aiQuestAuditService.record(
                member.getId(), aiResponse, draft,
                List.of(new MarketAiQuestGeneration.Attempt(1, "{json}", null)), null);
        var savedGeneration = aiGenerationRepository
                .findAllByMemberIdOrderByCreatedAtDesc(member.getId()).getFirst();
        assertEquals(generationId, savedGeneration.getId());
        assertEquals(profile.profileId(), savedGeneration.getProfileSnapshot().getId());
        assertEquals("milk", savedGeneration.getValidatedQuest().objectives().getFirst().productId());
        System.out.printf(
                "[BehaviorPilotTest][7/7] AI_AUDIT source=%s model=%s attempts=%d profile=%s%n",
                savedGeneration.getSource(), savedGeneration.getModel(),
                savedGeneration.getAttempts().size(), savedGeneration.getProfileSnapshot().getId());
    }

    private List<BehaviorLogRequest> successfulEvents(UUID sessionId) {
        List<BehaviorLogRequest> events = new ArrayList<>();
        events.add(request(sessionId, 1, "SHOP.LIST_OPENED", StepOutcome.INCOMPLETE,
                payload(null, null, null, null, null, 1), false));
        events.add(request(sessionId, 2, "SHOP.ITEM_SELECTED", StepOutcome.SUCCESS,
                payload("milk", 1, 1, 1800L, null, null), false));
        events.add(request(sessionId, 3, "SHOP.QUANTITY_CHANGED", StepOutcome.SUCCESS,
                payload("milk", 1, 1, null, null, null), false));
        events.add(request(sessionId, 4, "SHOP.ITEM_SELECTED", StepOutcome.SUCCESS,
                payload("apple", 2, 2, 2800L, null, null), false));
        events.add(request(sessionId, 5, "SHOP.QUANTITY_CHANGED", StepOutcome.SUCCESS,
                payload("apple", 2, 2, null, null, null), false));
        events.add(request(sessionId, 6, "SHOP.ITEM_SELECTED", StepOutcome.SUCCESS,
                payload("curry", 1, 1, 2800L, null, null), false));
        events.add(request(sessionId, 7, "SHOP.QUANTITY_CHANGED", StepOutcome.SUCCESS,
                payload("curry", 1, 1, null, null, null), false));
        events.add(request(sessionId, 8, "SHOP.PRICE_CHECKED", StepOutcome.SUCCESS,
                payload(null, null, null, 7400L, 10000L, null), true));
        return List.copyOf(events);
    }

    private BehaviorLogRequest request(UUID sessionId, long sequence, String eventCode,
            StepOutcome outcome, ShoppingBehaviorPayload payload, boolean finalized) {
        Instant occurredAt = STARTED_AT.plusSeconds(sequence);
        return new BehaviorLogRequest(
                new EventMetadata(UUID.randomUUID(), sequence,
                        BehaviorLogService.SUPPORTED_SCHEMA_VERSION,
                        "1.0.0", "market-basic-shopping-v1", false, null, occurredAt),
                new IdentityContext(sessionId),
                new TaskContext("MARKET_SIMULATION", MARKET_TASK_ID,
                        "market-basic-shopping-v1", 2, "BASELINE",
                        EvidenceContext.ASSESSMENT_TASK),
                new ActionContext(eventCode, "MARKET_STEP_" + sequence, null,
                        outcome, Math.toIntExact(sequence), sequence * 100L,
                        sequence == 1 ? "OPEN_LIST" : null),
                new AccessibilityContext(InstructionMode.TEXT, TextLevel.STANDARD,
                        false, true, ControllerMode.TOUCH),
                null,
                finalized ? new TaskResultContext(true, 100.0, 8_000L) : null,
                null, null, null, null, null,
                finalized ? new SessionEndContext(SessionEndReason.COMPLETED, 0, 0L) : null,
                null,
                payload
        );
    }

    private ShoppingBehaviorPayload payload(String itemId, Integer requiredQuantity,
            Integer selectedQuantity, Long priceAmount, Long budgetAmount,
            Integer listOpenCount) {
        return new ShoppingBehaviorPayload(
                null, null, null, listOpenCount, null, null, null, null, null, null,
                requiredQuantity, selectedQuantity, priceAmount, budgetAmount, null,
                itemId, null, null
        );
    }
}
