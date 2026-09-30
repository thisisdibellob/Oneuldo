package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in repair regression using a saved profile and two recorded invalid drafts.
 * Only the repair response is live. No gameplay, training, or database mutation.
 */
@EnabledIfEnvironmentVariable(named="AI_QUEST_BUDGET_LIVE",matches="true")
class MarketQuestBudgetLiveTest {
    @Test void actual_model_repairs_both_recorded_underfunded_quests() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var root=Path.of("../output/quest-budget-fix-20260930");Files.createDirectories(root);
        var profile=mapper.readValue(Files.readString(Path.of("../output/assistant-persona-retest-20260930/profile.json")),AiUserProfileResponse.class);
        var plan=profile.profile().practicePlan();
        var recommendation=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),profile.sourceDatasetId(),
            profile.sourceAnalysisId(),profile.profileId(),profile.profileVersion(),"MARKET_SIMULATION",
            plan.recommendedDifficulty(),"AI_PROFILE",new MarketDifficultyRecommendationResponse.Adjustments(
                plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),
            plan.reasonCodes(),profile.promptVersion(),Instant.now());
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties=new OllamaProperties("http://127.0.0.1:18083","qwen3.6:27b-q4_K_M",18432,
            Duration.ofMinutes(5),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(5));
        var real=new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(),properties);
        var drafts=mapper.readValue(getClass().getResourceAsStream("/market/underfunded-quests-20260930.json"),MarketAiQuestDraft[].class);
        for(var failed:drafts) {
            var member=UUID.randomUUID();
            var recommendations=mock(MarketDifficultyRecommendationService.class);when(recommendations.recommend(member)).thenReturn(recommendation);
            var profiles=mock(AiUserProfileService.class);when(profiles.find(member,profile.profileId())).thenReturn(profile);
            var client=mock(GroqChatClient.class);var calls=new ArrayList<String>();
            var report=mapper.createObjectNode();report.put("recordedInvalidBudget",failed.budget());report.put("databaseWrites",false);
            when(client.complete(anyString(),anyString(),eq(900),eq(0.2))).thenAnswer(call->{
                calls.add(call.getArgument(1));
                if(calls.size()==1) {var recorded=mock(GroqChatClient.GroqChatResult.class);when(recorded.text()).thenReturn(mapper.writeValueAsString(failed));when(recorded.model()).thenReturn("recorded-fixture");return recorded;}
                report.put("repairPrompt",(String)call.getArgument(1));
                var response=real.complete(call.getArgument(0),call.getArgument(1),900,0.2);
                report.set("response",mapper.valueToTree(response));return response;
            });
            var audit=mock(MarketAiQuestAuditService.class);
            var service=new MarketAiQuestService(new MarketAiQuestPromptFactory(mapper),new MarketAiQuestValidator(),recommendations,audit,profiles,client,mapper, org.mockito.Mockito.mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class));
            long started=System.nanoTime();
            try {
                var result=service.generate(member);report.set("result",mapper.valueToTree(result));
                assertThat(result.source()).isEqualTo("AI");assertThat(calls).hasSize(2);
                assertThat(calls.get(1)).contains("8600","12600","lineItems");
            } finally {
                report.put("wallSeconds",(System.nanoTime()-started)/1e9);
                Files.writeString(root.resolve("repair-"+failed.budget()+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
            }
        }
    }
}
