package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.member.domain.Member;
import org.junit.jupiter.api.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Same recorded human play, new recommendation. Never counted as another play. */
class AdaptiveWorldSourceTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final Path root=Path.of("../output/adaptive-world-20261012");
    void save(Path file,Object value)throws Exception{Files.writeString(file,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n");}
    @Test void original_play_with_all_events_fits_and_can_generate()throws Exception{
        Assumptions.assumeTrue(Files.exists(root.resolve("environment-context.json")));
        boolean live="true".equals(System.getenv("ADAPTIVE_WORLD_LIVE"));
        Path target=root.resolve(live?System.getProperty("adaptive.live.file","live-generation.json"):"source-budget.json");
        if(live)assertThat(Files.exists(target)).isFalse();
        var input=mapper.treeToValue(mapper.readTree(Files.readString(Path.of("../output/manual-reanalysis-20261012/original-analysis-and-input.json"))).path("input"),BehaviorAnalysisInput.class);
        var original=mapper.readTree(Files.readString(Path.of("../output/manual-reanalysis-20261012/profile-audits.json"))).get(0);
        var analysis=mapper.treeToValue(original.path("profile"),AiBehaviorAnalysis.class);
        UUID member=UUID.randomUUID(),profileId=UUID.randomUUID(),analysisId=UUID.randomUUID();
        var profile=new AiUserProfileResponse(profileId,1,null,analysisId,input.datasetId(),input.sessions().getFirst().sessionId(),"READY","qwen3.6:27b-q4_K_M","source-human-play",0,Instant.now(),null,analysis);
        var p=analysis.practicePlan();
        var rec=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),input.datasetId(),analysisId,profileId,1,"MARKET_SIMULATION",p.recommendedDifficulty(),"AI_PROFILE",new MarketDifficultyRecommendationResponse.Adjustments(p.itemCount(),p.quantityComplexity(),p.budgetPressure(),p.textSupport()),p.reasonCodes(),AdaptiveMarketQuestService.VERSION,Instant.now());
        var recommendations=mock(MarketDifficultyRecommendationService.class);when(recommendations.recommend(member)).thenReturn(rec);
        var profiles=mock(AiUserProfileService.class);when(profiles.find(member,profileId)).thenReturn(profile);
        var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);when(snapshots.findByIdAndMemberId(input.datasetId(),member)).thenReturn(Optional.of(new BehaviorAnalysisInputSnapshot(mock(Member.class),input)));
        var history=mock(PracticeHistoryService.class);var actualHistory=mapper.createArrayNode();
        actualHistory.addObject().put("sessionId",profile.sourceSessionId().toString()).put("sourceDatasetId",input.datasetId().toString()).put("currentSession",true)
            .set("recordedPractice",PracticeHistoryService.project(mapper,new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input),profile.sourceSessionId()));
        when(history.forProfile(member,profile)).thenReturn(actualHistory);
        var audit=mock(MarketAiQuestAuditService.class);var validator=new MarketAiQuestValidator();var contract=new AdaptiveQuestContract(mapper,validator);
        var report=mapper.createObjectNode().put("realAI",live).put("newHumanPlays",0).put("sourceSessionId",profile.sourceSessionId().toString()).put("status","RUNNING");
        var calls=report.putArray("calls");var count=new AtomicInteger();
        GroqChatClient actual;
        if(live){var config=new Properties();try(var in=Files.newInputStream(Path.of("../output/manual-play-20261012/application-runtime.private.properties"))){config.load(in);}var key=config.getProperty("ai.ollama.api-key");
            var props=new OllamaProperties("http://127.0.0.1:18084","qwen3.6:27b-q4_K_M",24576,Duration.ofMinutes(5),Duration.ofSeconds(10),8,"10m",key);
            var factory=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());factory.setReadTimeout(Duration.ofMinutes(5));
            actual=new RestOllamaChatClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(factory).build(),props);
        }else actual=null;
        GroqChatClient recording=new GroqChatClient(){
            public GroqChatResult complete(String s,String u){return complete(s,u,2600,.2);}
            public GroqChatResult complete(String s,String u,int max,double temperature){
                var call=calls.addObject().put("inputTokens",QwenTokenCounter.inputTokens(s,u)).put("outputMax",max).put("systemPrompt",s).put("inputPrompt",u);count.incrementAndGet();
                var sizes=call.putObject("tokensByField");var source=mapper.readTree(u);for(String f:source.propertyNames())sizes.put(f,QwenTokenCounter.count(source.get(f).toString()));
                var es=call.putObject("evidenceTokens");var ev=source.path("recordedEvidence");for(String f:ev.propertyNames())es.put(f,QwenTokenCounter.count(ev.get(f).toString()));
                try{save(target,report);}catch(Exception e){throw new RuntimeException(e);}
                assertThat(QwenTokenCounter.inputTokens(s,u)+max+32).isLessThanOrEqualTo(24000);
                if(!live){
                    if(count.get()==1){try{return new GroqChatResult(mapper.readTree(Files.readString(root.resolve("live-generation-3.json"))).path("calls").get(0).path("response").path("text").asString(),"reused-observation-budget-only");}catch(Exception e){throw new RuntimeException(e);}}
                    throw new IllegalStateException("BUDGET_ONLY_STOP");
                }
                long start=System.nanoTime();var result=actual.complete(s,u,max,temperature);call.put("wallSeconds",(System.nanoTime()-start)/1e9).set("response",mapper.valueToTree(result));
                try{save(target,report);}catch(Exception e){throw new RuntimeException(e);}return result;
            }};
        doAnswer(call->{report.set("attempts",mapper.valueToTree(call.getArgument(4)));save(target,report);return null;}).when(audit).record(any(),any(),any(),any(),any(),any(),anyString());
        var service=new AdaptiveMarketQuestService(recommendations,profiles,snapshots,history,audit,validator,contract,recording,mapper);
        ReflectionTestUtils.setField(service,"tokenBudget",live?24000:1000000);ReflectionTestUtils.setField(service,"modelIdentity","qwen3.6:27b-q4_K_M:adaptive-world-test");
        var context=mapper.readValue(Files.readString(root.resolve("environment-context.json")),MarketAiQuestRequest.EnvironmentContext.class);
        var evidence=AdaptiveQuestEvidence.build(mapper,input);assertThat(evidence.path("eventCount").asInt()).isEqualTo(input.eventCount());
        var encoded=new FinalSourceEncoding(mapper).encode(evidence);assertThat(new FinalSourceEncoding(mapper).decode(encoded)).isEqualTo(evidence);
        int ordinal=0,samples=0;
        for(var session:input.sessions())for(var event:session.events()){
            ordinal++;var originalEvent=mapper.valueToTree(event);
            if(!"SHOP.MOVEMENT_SAMPLED".equals(originalEvent.path("action").path("eventCode").asString()))continue;
            final String alias="E"+ordinal;
            var projected=evidence.path("events").valueStream().filter(e->alias.equals(e.path(0).asString())).findFirst().orElseThrow();
            assertThat(projected.path(3).asLong()).isEqualTo(event.elapsedFromSessionStartMs());
            for(String field:List.of("x","y","blocked","controlMode"))if(originalEvent.path("payload").hasNonNull(field))assertThat(projected.path(5).path(field)).isEqualTo(originalEvent.path("payload").path(field));
            if(originalEvent.path("payload").path("marketContent").hasNonNull("movementSpan"))assertThat(projected.path(5).path("movementSpan")).isEqualTo(originalEvent.path("payload").path("marketContent").path("movementSpan"));
            samples++;
        }
        report.put("unchangedRawMovementSamples",samples);
        var historyContext=service.historyContext(actualHistory,input);assertThat(historyContext.get(0).has("recordedPractice")).isFalse();assertThat(actualHistory.get(0).has("recordedPractice")).isTrue();
        var differentDataset=actualHistory.deepCopy();((tools.jackson.databind.node.ObjectNode)differentDataset.get(0)).put("sourceDatasetId",UUID.randomUUID().toString());
        assertThat(service.historyContext(differentDataset,input).get(0).has("recordedPractice")).isTrue();
        long start=System.nanoTime();
        try(var deadline=new AiOperationDeadline(Duration.ofMinutes(5))){
            try{var result=service.generate(member,context,stage->report.put("stage",stage));report.set("result",mapper.valueToTree(result));report.put("status","READY");assertThat(result.quest().runtimePlan()).isNotNull();assertThat(live).isTrue();}
            catch(RuntimeException error){report.put("status",live?"FAILED":"BUDGET_CHECKED").put("error",error.getMessage());if(live)throw error;assertThat(count.get()).isEqualTo(2);}
        }finally{report.put("wallSeconds",(System.nanoTime()-start)/1e9);save(target,report);}
        assertThat(count.get()).isLessThanOrEqualTo(5);
    }
}
