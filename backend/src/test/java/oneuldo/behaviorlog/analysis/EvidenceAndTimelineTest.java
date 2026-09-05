package oneuldo.behaviorlog.analysis;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.ai.client.GroqChatClient;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class EvidenceAndTimelineTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    @Test void 개발검토된_접근성_카드만_반환하고_없는_인용을_거부한다() {
        assertThat(EvidenceIndex.retrieve("interface").stream().map(c -> c.path("card_id").asString()))
                .containsExactly("I10-C1", "I10-C2");
        assertThat(EvidenceIndex.retrieve("")).isEmpty();
        assertThatThrownBy(() -> EvidenceIndex.validateCitations(List.of("P10-C1"), "interface")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EvidenceIndex.validateCitations(List.of("INVENTED"), "interface")).isInstanceOf(IllegalArgumentException.class);
        EvidenceIndex.validateCitations(List.of("I10-C1"), "interface");
    }
    @Test void 합성24사례는_실사용자나_전문가정답으로_승격되지_않는다() throws Exception {
        try (var stream = getClass().getResourceAsStream("/evidence/synthetic-cases.json")) {
            var cases = mapper.readTree(stream);
            assertThat(cases.size()).isEqualTo(24);
            Set<String> ids = new HashSet<>();
            for (var c : cases) {
                assertThat(ids.add(c.path("case_id").asString())).isTrue();
                assertThat(c.path("synthetic").asBoolean()).isTrue();
                assertThat(c.path("expert_validated").asBoolean()).isFalse();
                assertThat(c.path("alternative_explanations_ko").size()).isPositive();
                assertThat(c.path("must_not_conclude_ko").asString()).isNotBlank();
            }
        }
    }
    @Test void 분할은_모든_사건을_순서대로_한번씩_포함한다() {
        var input = input(12);
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var pipeline = new TimelineAnalysisPipeline(prompts, new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),
                mock(GroqChatClient.class), mapper);
        var chunks = pipeline.partition(input, 15000);
        assertThat(chunks.size()).isGreaterThan(1);
        assertThat(chunks.stream().flatMap(c -> c.input().sessions().stream()).flatMap(s -> s.events().stream())
                .map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList())
                .containsExactlyElementsOf(input.input().sessions().getFirst().events().stream().map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList());
        for (var chunk : chunks) assertThat(prompts.systemPrompt().length() + prompts.userPrompt(chunk).length()).isLessThan(15000);
        assertThatThrownBy(() -> pipeline.partition(input, 100)).hasMessage("SINGLE_EVENT_EXCEEDS_LIMIT");
    }
    private BehaviorAnalysisInputResponse input(int count) {
        UUID dataset = UUID.randomUUID(), session = UUID.randomUUID();
        var now = Instant.parse("2026-09-05T00:00:00Z");
        List<BehaviorAnalysisInput.EventTimeline> events = new ArrayList<>();
        for (int i=0; i<count; i++) events.add(mapper.readValue("{\"behaviorLogId\":\"" + UUID.randomUUID()
                + "\",\"sequence\":"+(i+1)+",\"elapsedFromSessionStartMs\":0,\"payload\":{\"type\":\"SHOPPING\",\"marketContent\":{\"rawText\":\""+"x".repeat(1500)+"\"}}}", BehaviorAnalysisInput.EventTimeline.class));
        var data = new BehaviorAnalysisInput("test", dataset, now, new BehaviorAnalysisInput.AnalysisWindow(now,now),
                "anonymous", 1,count,List.of(new BehaviorAnalysisInput.SessionTimeline(session,now,now,null,events)));
        return new BehaviorAnalysisInputResponse(dataset,"test",now,1,count,data);
    }
}
