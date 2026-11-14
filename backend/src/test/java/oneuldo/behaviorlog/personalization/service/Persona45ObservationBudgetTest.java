package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputSnapshot;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.member.domain.Member;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class Persona45ObservationBudgetTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    @Test void actual_long_mcp_source_reaches_generation_with_original_actions_and_geometry() throws Exception {
        var run=Path.of("../output/persona45-mcp-20261013/auditor");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(run.resolve("profiles.json")));
        var rows=mapper.readTree(Files.readString(run.resolve("input-snapshots.json")));
        BehaviorAnalysisInput input=null;
        for(var row:rows){var next=mapper.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);if(input==null||next.eventCount()>input.eventCount())input=next;}
        var analysis=mapper.treeToValue(mapper.readTree(Files.readString(run.resolve("profiles.json"))).get(0).path("profile"),AiBehaviorAnalysis.class);
        UUID member=UUID.randomUUID(),profileId=UUID.randomUUID(),analysisId=UUID.randomUUID();
        var profile=new AiUserProfileResponse(profileId,1,null,analysisId,input.datasetId(),input.sessions().getFirst().sessionId(),"READY","synthetic-budget-contract","test",0,Instant.now(),null,analysis);
        var plan=analysis.practicePlan();
        var rec=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),input.datasetId(),analysisId,profileId,1,"MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_PROFILE",new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),plan.reasonCodes(),AdaptiveMarketQuestService.VERSION,Instant.now());
        var recommendations=mock(MarketDifficultyRecommendationService.class);when(recommendations.recommend(member)).thenReturn(rec);
        var profiles=mock(AiUserProfileService.class);when(profiles.find(member,profileId)).thenReturn(profile);
        var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);when(snapshots.findByIdAndMemberId(input.datasetId(),member)).thenReturn(Optional.of(new BehaviorAnalysisInputSnapshot(mock(Member.class),input)));
        var history=mock(PracticeHistoryService.class);when(history.forProfile(member,profile)).thenReturn(mapper.createArrayNode());
        var originals=AdaptiveQuestEvidence.build(mapper,input);var report=mapper.createArrayNode();var observations=new AtomicInteger();var generations=new AtomicInteger();
        GroqChatClient client=new GroqChatClient(){
            public GroqChatResult complete(String system,String prompt){return complete(system,prompt,2600,.2);}
            public GroqChatResult complete(String system,String prompt,int max,double temp){
                int required=QwenTokenCounter.inputTokens(system,prompt)+max+32;
                report.addObject().put("stage",system.startsWith("Respond in Korean")?"OBSERVATION":system.startsWith("Synthesize")?"SYNTHESIS":"GENERATION").put("requiredTokens",required);
                assertThat(required).isLessThanOrEqualTo(24000);
                if(system.startsWith("Respond in Korean")){
                    observations.incrementAndGet();var part=AdaptiveQuestEvidence.decodeObservation(mapper,mapper.readTree(prompt));

                    var item=mapper.createObjectNode().put("behaviorObservation","원본 행동 확인").put("movementObservation","제공된 위치 부분 확인").put("nextObservationQuestion","다음 행동 관찰");
                    item.putArray("alternativeExplanations");item.putArray("unknowns").add("아직 관찰하지 않음");item.putArray("evidenceIds").add(part.path("events").get(0).path(0).asString());
                    return new GroqChatResult(item.toString(),"synthetic-budget-contract");
                }
                if(system.startsWith("Synthesize")){
                    var combinedSource=AdaptiveQuestTransport.decode(mapper,mapper.readTree(prompt));
                    var item=mapper.createObjectNode().put("behaviorObservation","원본 행동 확인").put("movementObservation","전체 부분을 종합하되 원인과 효과는 알 수 없음").put("nextObservationQuestion","다음 행동 관찰");
                    item.putArray("alternativeExplanations");item.putArray("unknowns").add("아직 관찰하지 않음");item.putArray("evidenceIds").add(combinedSource.path("partReports").path("evidenceIds").get(0).asString());
                    return new GroqChatResult(item.toString(),"synthetic-budget-contract");
                }
                generations.incrementAndGet();var decoded=AdaptiveQuestTransport.decode(mapper,mapper.readTree(prompt));
                for(String field:List.of("sourceEventDetails","navigationContext","recordedTasks"))assertThat(decoded.path("recordedEvidence").path(field)).isEqualTo(originals.path(field));
                assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,decoded))).isEqualTo(decoded);
                throw new IllegalStateException("CAPTURED_GENERATION_BUDGET");
            }
        };
        var audit=mock(MarketAiQuestAuditService.class);
        doAnswer(call->{Files.writeString(Path.of("../output/persona45-mcp-20261013/long-source-budget-attempts.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(call.getArgument(4)));return null;}).when(audit).record(any(),any(),any(),any(),any(),any(),any());
        var validator=new MarketAiQuestValidator();var service=new AdaptiveMarketQuestService(recommendations,profiles,snapshots,history,audit,validator,new AdaptiveQuestContract(mapper,validator),client,mapper);
        ReflectionTestUtils.setField(service,"tokenBudget",24000);
        var context=mapper.treeToValue(mapper.readTree(Files.readString(Path.of("../output/persona45-mcp-20261013/actual-shared-environment-context.json"))),MarketAiQuestRequest.EnvironmentContext.class);
        assertThatThrownBy(()->service.generate(member,context,stage->{})).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        Files.writeString(Path.of("../output/persona45-mcp-20261013/long-source-generation-budget.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        assertThat(observations.get()).isGreaterThan(0);assertThat(generations.get()).isEqualTo(1);
    }
    @Test void inspect_actual_mcp_sources_without_mutating_originals() throws Exception {
        var path=Path.of("../output/persona45-mcp-20261013/auditor/input-snapshots.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
        var report=mapper.createArrayNode();
        for(var snapshot:mapper.readTree(Files.readString(path))){
            var input=mapper.treeToValue(snapshot.path("input_data"),BehaviorAnalysisInput.class);
            var source=AdaptiveQuestEvidence.build(mapper,input);var before=source.deepCopy();
            var item=report.addObject();item.put("datasetId",input.datasetId().toString());item.put("eventCount",input.eventCount());
            var sizes=item.putObject("fieldTokens");
            for(String field:source.propertyNames())sizes.put(field,QwenTokenCounter.count(source.path(field).toString()));
            var readable=mapper.createArrayNode();for(var e:source.path("sourceEventDetails")){
                var row=readable.addArray();for(String field:java.util.List.of("id","eventCode","timeMs","itemId","quantityBefore","quantityAfter"))row.add(e.has(field)?e.get(field):mapper.nullNode());
                row.add(e.path("recordedAction").path("type").asString(""));row.add(e.path("stationId").asString(""));
            }
            java.util.List<AdaptiveQuestObservation.Part> planned;
            try { planned=AdaptiveQuestObservation.plan(mapper,source,readable,24000); }
            catch(oneuldo.ai.exception.AiInputLimitException failure) {
                item.put("failureRequiredTokens",failure.required()).put("limitTokens",failure.limit());
                Files.writeString(Path.of("../output/persona45-mcp-20261013/resumable-observation-source-diagnostic.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
                throw failure;
            }
            assertThat(planned.size()+5).isLessThanOrEqualTo(AdaptiveQuestContract.MAXIMUM_AI_CALLS);
            var restored=mapper.createArrayNode();var parts=item.putArray("partitionTokens");
            for(var part:planned){
                assertThat(part.requiredTokens()).isLessThanOrEqualTo(24000);
                var decoded=AdaptiveQuestEvidence.decodeObservation(mapper,mapper.readTree(part.prompt()));

                decoded.path("events").forEach(restored::add);
                for(String field:java.util.List.of("sourceEventDetails","navigationContext","recordedTasks","eventColumns","eventCount"))assertThat(decoded.path(field)).isEqualTo(source.path(field));
                assertThat(decoded.path("readableActions")).isEqualTo(readable);
                parts.addObject().put("providedRows",decoded.path("events").size()).put("requiredTokens",part.requiredTokens());
            }
            item.put("parts",planned.size());assertThat(restored).isEqualTo(source.path("events"));
            assertThat(source).isEqualTo(before);
        }
        var out=Path.of("../output/persona45-mcp-20261013/budget-recovery-verification.json");
        Files.writeString(out,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }
}
