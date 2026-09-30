package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.analysis.repository.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.*;
import oneuldo.behaviorlog.profile.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Saved real game evidence, fresh model calls. No new gameplay or persistent database writes. */
@EnabledIfEnvironmentVariable(named="AI_ADAPTIVE_PRACTICE_LIVE",matches="true")
class AdaptivePracticeLiveTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final Path fixtures=Path.of("../output/unit-support-loop-20260930");
    final Path out=Path.of("../output/adaptive-practice-20260930",System.getenv().getOrDefault("AI_ADAPTIVE_RUN","v1"));
    final AnalysisTokenBudget budget=new AnalysisTokenBudget();
    RestOllamaChatClient client;
    void save(String file,Object data) throws Exception {Files.writeString(out.resolve(file+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(data));}
    BehaviorAnalysisInputResponse input(int n) throws Exception {
        var raw=mapper.readTree(Files.readString(fixtures.resolve("supported-"+n+"/input.json")));
        if(raw.has("input")) return mapper.treeToValue(raw,BehaviorAnalysisInputResponse.class);
        var i=mapper.treeToValue(raw,BehaviorAnalysisInput.class);
        return new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
    }
    AiBehaviorAnalysisResponse old(int n) throws Exception {return mapper.treeToValue(mapper.readTree(Files.readString(fixtures.resolve("supported-"+n+"/analysis.json"))).path("response"),AiBehaviorAnalysisResponse.class);}
    AiBehaviorAnalysisResponse review(String name,BehaviorAnalysisInputResponse in,AiBehaviorAnalysisResponse old,String source,String expected) throws Exception {
        var refs=new AnalysisReferences(mapper,in);
        var root=(ObjectNode)new LosslessTables(mapper).decode(mapper.readTree(source));
        var rawDetails=mapper.createObjectNode();rawDetails.set(SourceEventDetails.FIELD,SourceEventDetails.build(mapper,in));
        var details=new LosslessTables(mapper).decode(mapper.readTree(refs.encode(rawDetails.toString()))).path(SourceEventDetails.FIELD);
        root.set(SourceEventDetails.FIELD,details);
        var prompt=AnalysisReviewPrompt.build(mapper,mapper.writeValueAsString(root),old.analysis(),refs);
        if(Files.exists(out.resolve(name+".json"))) {
            var saved=mapper.readTree(Files.readString(out.resolve(name+".json")));
            assertThat(saved.path("inputPrompt").asString()).isEqualTo(prompt);assertThat(saved.path("systemPrompt").asString()).isEqualTo(AnalysisReviewPrompt.system());
            assertThat(saved.path("status").asString()).isEqualTo("READY");
            return new AiBehaviorAnalysisResponse(UUID.randomUUID(),in.id(),"READY",saved.path("response").path("model").asString(),AiBehaviorAnalysisPromptFactory.VERSION,old.evidenceVersion(),in.eventCount(),0,Instant.now(),null,mapper.treeToValue(saved.path("analysis"),AiBehaviorAnalysis.class));
        }
        var report=mapper.createObjectNode();report.put("scope","saved-source final review only");report.put("databaseWrites",false);
        report.put("systemPrompt",AnalysisReviewPrompt.system());report.put("inputPrompt",prompt);report.put("expected",expected);
        long start=System.nanoTime();
        try {
            report.put("estimatedRequestTokens",budget.total(AnalysisReviewPrompt.system(),prompt,2400));
            budget.requireFits(AnalysisReviewPrompt.system(),prompt,2400,18000,"REVIEW_INPUT_TOO_LARGE");
            var response=client.complete(AnalysisReviewPrompt.system(),prompt,2400,0.1);report.set("response",mapper.valueToTree(response));
            assertThat(response.finishReason()).isNotEqualTo("length");
            var analysis=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(refs.read(AnalysisReviewPrompt.reviewedAnalysis(mapper,response.text(),refs)),in);
            report.set("analysis",mapper.valueToTree(analysis));
            assertThat(analysis.sessionAssessments().getFirst().judgment()).isEqualTo(expected);
            report.put("status","READY");
            return new AiBehaviorAnalysisResponse(UUID.randomUUID(),in.id(),"READY",response.model(),AiBehaviorAnalysisPromptFactory.VERSION,old.evidenceVersion(),in.eventCount(),0,Instant.now(),null,analysis);
        } catch(Exception|AssertionError e) { report.put("error",e.getMessage());throw e; }
        finally {report.put("wallSeconds",(System.nanoTime()-start)/1e9);save(name,report);}
    }
    @Test void wrong_skus_and_success_control_then_history_profile_and_executable_quest() throws Exception {
        Files.createDirectories(out);assertThat(Files.exists(out.resolve("profile.json"))).isFalse();
        ReflectionTestUtils.setField(budget,"requestTokens",18000);ReflectionTestUtils.setField(budget,"finalOutputTokens",2400);
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        var props=new OllamaProperties("http://127.0.0.1:18083","qwen3.6:27b-q4_K_M",18432,Duration.ofMinutes(6),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());http.setReadTimeout(Duration.ofMinutes(6));
        client=new RestOllamaChatClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(http).build(),props);
        var attempts=mapper.readTree(Files.readString(fixtures.resolve("supported-3/attempts.json")));
        var current=review("failure-review",input(3),old(3),attempts.get(attempts.size()-1).path("inputPrompt").asString(),"FAILURE");
        var control=Path.of("../output/ai-only-quality-20260930");
        review("success-review",mapper.readValue(Files.readString(control.resolve("input.json")),BehaviorAnalysisInputResponse.class),
            mapper.treeToValue(mapper.readTree(Files.readString(control.resolve("prior-analysis.json"))).path("response"),AiBehaviorAnalysisResponse.class),Files.readString(control.resolve("prior-review.json")),"SUCCESS");
        UUID member=UUID.randomUUID();var repo=mock(AiUserProfileRepository.class);var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);
        AiUserProfile previous=null;
        for(int n=1;n<=3;n++) {
            var in=input(n);var snap=mock(BehaviorAnalysisInputSnapshot.class);
            when(snap.getId()).thenReturn(in.id());when(snap.getInputData()).thenReturn(in.input());when(snap.getGeneratedAt()).thenReturn(in.generatedAt());when(snap.getSchemaVersion()).thenReturn(in.schemaVersion());when(snap.getEventCount()).thenReturn(in.eventCount());when(snap.getSessionCount()).thenReturn(in.sessionCount());
            when(snapshots.findByIdAndMemberId(in.id(),member)).thenReturn(Optional.of(snap));
            if(n==3) continue;
            var profileJson=mapper.readTree(Files.readString(fixtures.resolve("supported-"+n+"/profile.json")));
            var profile=mapper.treeToValue(profileJson.path("profile"),AiBehaviorAnalysis.class);
            var p=new AiUserProfile(member,n,previous==null?null:previous.getId(),old(n).analysisId(),in.id(),in.input().sessions().getFirst().sessionId(),"READY","old","old","","",List.of(),profile,null,0);
            when(repo.findByIdAndMemberIdAndStatus(p.getId(),member,"READY")).thenReturn(Optional.of(p));previous=p;
        }
        when(repo.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member,"READY")).thenReturn(Optional.of(previous));
        when(repo.save(any())).thenAnswer(call->{AiUserProfile p=call.getArgument(0);save("profile",p);when(repo.findByIdAndMemberIdAndStatus(p.getId(),member,"READY")).thenReturn(Optional.of(p));return p;});
        var history=new PracticeHistoryService(repo,snapshots,mapper);
        var service=new AiUserProfileService(repo,new AiUserProfilePromptFactory(mapper),new AiUserProfileValidator(new MarketAiDifficultyValidator()),client,mapper,budget,history);
        var profile=service.updateFromSession(member,input(3).input().sessions().getFirst().sessionId(),current);
        assertThat(profile.status()).isEqualTo("READY");
        var plan=profile.profile().practicePlan();
        var rec=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),current.datasetId(),current.analysisId(),profile.profileId(),profile.profileVersion(),"MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_PROFILE",
            new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),plan.reasonCodes(),AiUserProfilePromptFactory.VERSION,Instant.now());
        var prompts=new MarketAiQuestPromptFactory(mapper);var prompt=prompts.withPracticeHistory(prompts.userPrompt(profile.asAnalysisResponse(),rec),history.forProfile(member,profile));
        var report=mapper.createObjectNode();report.put("inputPrompt",prompt);report.put("systemPrompt",prompts.systemPrompt());
        long start=System.nanoTime();
        try {budget.requireFits(prompts.systemPrompt(),prompt,900,18000,"QUEST_INPUT_TOO_LARGE");
            var response=client.complete(prompts.systemPrompt(),prompt,900,0.2);report.set("response",mapper.valueToTree(response));
            assertThat(response.finishReason()).isNotEqualTo("length");
            var quest=new MarketAiQuestValidator().validate(mapper.readValue(response.text(),MarketAiQuestDraft.class),plan.recommendedDifficulty());
            assertThat(quest.objectives()).hasSize(plan.itemCount());report.set("quest",mapper.valueToTree(quest));report.put("status","READY");
        } finally {report.put("wallSeconds",(System.nanoTime()-start)/1e9);save("quest",report);}
    }
}
