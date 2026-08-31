package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.personalization.domain.MarketDifficultyRecommendation;
import oneuldo.behaviorlog.personalization.repository.MarketDifficultyRecommendationRepository;
import oneuldo.behaviorlog.profile.repository.BehaviorProfileSnapshotRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.repository.MemberRepository;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput;
import oneuldo.simulationquest.llm.input.LlmSimulationGenerationInput.PersonalizationMode;
import oneuldo.simulationquest.llm.input.LlmSimulationInputService;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class MarketDifficultyRecommendationServiceTest {

    @Test
    void AI가_프로파일을_보고_추천한_난이도와_조정값을_저장한다() {
        UUID memberId = UUID.randomUUID();
        MemberRepository memberRepository = mock(MemberRepository.class);
        BehaviorProfileSnapshotRepository profileRepository =
                mock(BehaviorProfileSnapshotRepository.class);
        MarketDifficultyRecommendationRepository recommendationRepository =
                mock(MarketDifficultyRecommendationRepository.class);
        MarketDifficultyRecommendationPersistenceService persistenceService =
                mock(MarketDifficultyRecommendationPersistenceService.class);
        LlmSimulationInputService inputService = mock(LlmSimulationInputService.class);
        MarketAiDifficultyPromptFactory promptFactory = mock(MarketAiDifficultyPromptFactory.class);
        GroqChatClient groqChatClient = mock(GroqChatClient.class);
        var input = mock(LlmSimulationGenerationInput.class);
        var plan = mock(LlmSimulationGenerationInput.GenerationPlan.class);
        when(input.generationPlan()).thenReturn(plan);
        when(plan.personalizationMode()).thenReturn(PersonalizationMode.BEHAVIOR_INFORMED);
        Member member = mock(Member.class);
        when(memberRepository.findById(memberId)).thenReturn(Optional.of(member));
        when(profileRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId))
                .thenReturn(Optional.empty());
        when(recommendationRepository.findFirstByMemberIdOrderByGeneratedAtDesc(memberId))
                .thenReturn(Optional.empty());
        when(inputService.build(eq(memberId), any(UUID.class))).thenReturn(input);
        when(promptFactory.systemPrompt()).thenReturn("system");
        when(promptFactory.userPrompt(input)).thenReturn("user");
        when(groqChatClient.complete("system", "user", 350, 0.2)).thenReturn(
                new GroqChatClient.GroqChatResult("""
                        {"recommendedDifficulty":3,"itemCount":4,
                        "quantityComplexity":"HIGH","budgetPressure":"HIGH",
                        "textSupport":"REDUCED","reasonCodes":["PROFILE_STABLE"]}
                        """, "qwen-test"));
        when(persistenceService.save(eq(member), eq(null), eq("market-ai-difficulty-v1"), any()))
                .thenAnswer(invocation -> new MarketDifficultyRecommendation(
                        member, null, invocation.getArgument(2), invocation.getArgument(3),
                        java.time.Instant.now()));

        var service = new MarketDifficultyRecommendationService(
                memberRepository, profileRepository, recommendationRepository,
                persistenceService, new MarketDifficultyRecommendationPolicy(), inputService, promptFactory,
                new MarketAiDifficultyValidator(), groqChatClient, new ObjectMapper());

        var response = service.recommend(memberId);

        assertThat(response.recommendedDifficulty()).isEqualTo(3);
        assertThat(response.adjustments().itemCount()).isEqualTo(4);
        assertThat(response.personalizationMode()).isEqualTo("BEHAVIOR_INFORMED");
        assertThat(response.policyVersion()).isEqualTo("market-ai-difficulty-v1");
        assertThat(response.reasonCodes()).containsExactly("PROFILE_STABLE");
    }
}
