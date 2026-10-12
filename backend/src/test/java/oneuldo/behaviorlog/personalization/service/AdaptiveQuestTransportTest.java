package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import oneuldo.ai.client.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.BehaviorAnalysisInputSnapshotRepository;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.member.domain.Member;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdaptiveQuestTransportTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();

    @Test void roundtrip_keeps_literal_controls_and_reserved_source_values() {
        var source=mapper.createObjectNode();
        source.set("recordedEvidence",mapper.readTree("{\"events\":[{\"x\":0.123456789,\"blocked\":false},{\"x\":null},{\"$r\":1},{\"$a\":[1,2]}]}"));
        source.set("practiceHistory",mapper.readTree("[{\"goal\":\"규격 비교 원문\",\"count\":0},{\"goal\":\"규격 비교 원문\",\"count\":1}]"));
        source.set("outputSchema",mapper.readTree("{\"values\":[null,false,0,\"\"],\"$r\":\"literal\"}"));
        source.set("readableActions",mapper.readTree("[[\"E1\",\"SHOP.QUANTITY_CHANGED\",1,\"milk\",0,2]]"));
        source.set("currentEnvironment",mapper.readTree("{\"coordinates\":[0.123456789,0,0.123456789],\"unknown\":null,\"flag\":false,\"literal\":{\"$r\":0}}"));
        var before=source.deepCopy();var packed=AdaptiveQuestTransport.encode(mapper,source);
        assertThat(packed.get("outputSchema")).isEqualTo(source.get("outputSchema"));
        assertThat(packed.get("readableActions")).isEqualTo(source.get("readableActions"));
        assertThat(AdaptiveQuestTransport.decode(mapper,packed)).isEqualTo(source);
        assertThat(source).isEqualTo(before);
    }

    @Test void two_recorded_plays_fit_generation_without_dropping_history() throws Exception {
        Path run=Path.of("../output/adaptive-five-persona-20261012"), auditPath=run.resolve("auditor");
        Assumptions.assumeTrue(Files.exists(auditPath.resolve("input-snapshots.json")));
        var snapshotsJson=mapper.readTree(Files.readString(auditPath.resolve("input-snapshots.json")));
        Assumptions.assumeTrue(snapshotsJson.size()>=2);
        var input=mapper.treeToValue(snapshotsJson.get(1).path("input_data"),BehaviorAnalysisInput.class);
        var previous=mapper.treeToValue(snapshotsJson.get(0).path("input_data"),BehaviorAnalysisInput.class);
        var profilesJson=mapper.readTree(Files.readString(auditPath.resolve("profiles.json")));
        var profileRow=profilesJson.get(1);
        var analysis=mapper.treeToValue(profileRow.path("profile"),AiBehaviorAnalysis.class);
        UUID member=UUID.randomUUID(),profileId=UUID.randomUUID(),analysisId=UUID.randomUUID();
        var profile=new AiUserProfileResponse(profileId,2,null,analysisId,input.datasetId(),input.sessions().getFirst().sessionId(),"READY","test","test",0,Instant.now(),null,analysis);
        var plan=analysis.practicePlan();
        var rec=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),input.datasetId(),analysisId,profileId,2,"MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_PROFILE",new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),plan.reasonCodes(),AdaptiveMarketQuestService.VERSION,Instant.now());
        var recommendations=mock(MarketDifficultyRecommendationService.class);when(recommendations.recommend(member)).thenReturn(rec);
        var profiles=mock(AiUserProfileService.class);when(profiles.find(member,profileId)).thenReturn(profile);
        var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);when(snapshots.findByIdAndMemberId(input.datasetId(),member)).thenReturn(Optional.of(new BehaviorAnalysisInputSnapshot(mock(Member.class),input)));
        var history=mock(PracticeHistoryService.class);var actualHistory=mapper.createArrayNode();
        for(var original:List.of(previous,input)) {
            var sid=original.sessions().getFirst().sessionId();
            actualHistory.addObject().put("sessionId",sid.toString()).put("sourceDatasetId",original.datasetId().toString()).put("sourceAvailable",true)
                .set("recordedPractice",PracticeHistoryService.project(mapper,new BehaviorAnalysisInputResponse(original.datasetId(),original.schemaVersion(),original.generatedAt(),original.sessionCount(),original.eventCount(),original),sid));
        }
        when(history.forProfile(member,profile)).thenReturn(actualHistory);
        var generations=mapper.readTree(Files.readString(auditPath.resolve("generations.json")));
        var successful=generations.get(1);var failed=generations.get(2);
        var oldPrompt=mapper.readTree(successful.path("attempts").get(1).path("validationDetails").path("submittedPrompt").asString());
        var context=mapper.treeToValue(oldPrompt.path("currentEnvironment"),MarketAiQuestRequest.EnvironmentContext.class);
        var report=mapper.createArrayNode();var calls=new AtomicInteger();
        GroqChatClient client=new GroqChatClient(){
            public GroqChatResult complete(String system,String prompt){return complete(system,prompt,2600,.2);}
            public GroqChatResult complete(String system,String prompt,int max,double temp){
                int number=calls.incrementAndGet(),tokens=QwenTokenCounter.inputTokens(system,prompt);
                report.addObject().put("stage",number).put("inputTokens",tokens).put("outputMax",max).put("requiredTokens",tokens+max+32);
                assertThat(tokens+max+32).isLessThanOrEqualTo(24000);
                if(number==1)return new GroqChatResult(failed.path("attempts").get(0).path("rawOutput").asString(),"recorded-observation-budget-only");
                var packed=mapper.readTree(prompt);var decoded=AdaptiveQuestTransport.decode(mapper,packed);
                assertThat(decoded.path("practiceHistory")).hasSize(2);
                assertThat(decoded.path("practiceHistory").get(0).path("recordedPractice").isObject()).isTrue();
                assertThat(decoded.path("recordedEvidence").path("eventCount").asInt()).isEqualTo(363);
                assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,decoded))).isEqualTo(decoded);
                throw new IllegalStateException("CAPTURED_GENERATION");
            }
        };
        var validator=new MarketAiQuestValidator();
        var service=new AdaptiveMarketQuestService(recommendations,profiles,snapshots,history,mock(MarketAiQuestAuditService.class),validator,new AdaptiveQuestContract(mapper,validator),client,mapper);
        ReflectionTestUtils.setField(service,"tokenBudget",24000);
        assertThatThrownBy(()->service.generate(member,context,stage->{})).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(calls.get()).isEqualTo(2);
        Files.writeString(recordOutput().resolve("transport-budget-check.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
    }

    @Test void three_recorded_plays_fit_generation_and_review_without_losing_environment() throws Exception {
        Path auditPath=Path.of("../output/adaptive-five-fixes-20261012/auditor");
        Assumptions.assumeTrue(Files.exists(auditPath.resolve("input-snapshots.json")));
        var originals=new ArrayList<BehaviorAnalysisInput>();
        var snapshotRows=mapper.readTree(Files.readString(auditPath.resolve("input-snapshots.json")));
        Assumptions.assumeTrue(snapshotRows.size()>=3);
        for(int i=0;i<3;i++)originals.add(mapper.treeToValue(snapshotRows.get(i).path("input_data"),BehaviorAnalysisInput.class));
        var input=originals.getLast();
        var analysis=mapper.treeToValue(mapper.readTree(Files.readString(auditPath.resolve("profiles.json"))).get(2).path("profile"),AiBehaviorAnalysis.class);
        UUID member=UUID.randomUUID(),profileId=UUID.randomUUID(),analysisId=UUID.randomUUID();
        var profile=new AiUserProfileResponse(profileId,3,null,analysisId,input.datasetId(),input.sessions().getFirst().sessionId(),"READY","test","test",0,Instant.now(),null,analysis);
        var plan=analysis.practicePlan();
        var rec=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),input.datasetId(),analysisId,profileId,3,"MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_PROFILE",new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),plan.reasonCodes(),AdaptiveMarketQuestService.VERSION,Instant.now());
        var recommendations=mock(MarketDifficultyRecommendationService.class);when(recommendations.recommend(member)).thenReturn(rec);
        var profiles=mock(AiUserProfileService.class);when(profiles.find(member,profileId)).thenReturn(profile);
        var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);when(snapshots.findByIdAndMemberId(input.datasetId(),member)).thenReturn(Optional.of(new BehaviorAnalysisInputSnapshot(mock(Member.class),input)));
        var history=mock(PracticeHistoryService.class);var actualHistory=mapper.createArrayNode();
        for(var original:originals){var sid=original.sessions().getFirst().sessionId();
            actualHistory.addObject().put("sessionId",sid.toString()).put("sourceDatasetId",original.datasetId().toString()).put("sourceAvailable",true)
                .set("recordedPractice",PracticeHistoryService.project(mapper,new BehaviorAnalysisInputResponse(original.datasetId(),original.schemaVersion(),original.generatedAt(),original.sessionCount(),original.eventCount(),original),sid));}
        when(history.forProfile(member,profile)).thenReturn(actualHistory);
        var generations=mapper.readTree(Files.readString(auditPath.resolve("generations.json")));
        var earlier=AdaptiveQuestTransport.decode(mapper,mapper.readTree(generations.get(2).path("attempts").get(1).path("validationDetails").path("submittedPrompt").asString()));
        var environment=earlier.path("currentEnvironment");
        var context=mapper.treeToValue(environment,MarketAiQuestRequest.EnvironmentContext.class);
        var recordedObservation=generations.get(3).path("attempts").get(0).path("rawOutput").asString();
        var evidence=AdaptiveQuestEvidence.build(mapper,input);
        var expectedHistory=new AdaptiveMarketQuestService(null,null,null,null,null,null,null,null,mapper).historyContext(actualHistory,input);
        var report=mapper.createArrayNode();var calls=new AtomicInteger();
        GroqChatClient client=new GroqChatClient(){
            public GroqChatResult complete(String system,String prompt){return complete(system,prompt,2600,.2);}
            public GroqChatResult complete(String system,String prompt,int max,double temp){
                int number=calls.incrementAndGet(),tokens=QwenTokenCounter.inputTokens(system,prompt);
                report.addObject().put("stage",number==1?"OBSERVATION":number==2?"GENERATION":"REVIEW").put("inputTokens",tokens).put("outputMax",max).put("requiredTokens",tokens+max+32);
                assertThat(tokens+max+32).isLessThanOrEqualTo(24000);
                if(number==1)return new GroqChatResult(recordedObservation,"recorded-observation-budget-only");
                var decoded=AdaptiveQuestTransport.decode(mapper,mapper.readTree(prompt));
                var source=number==2?decoded:decoded.path("originalSource");
                assertThat(source.path("practiceHistory")).isEqualTo(mapper.readTree(expectedHistory.toString()));
                assertThat(source.path("currentEnvironment")).isEqualTo(environment);
                assertThat(source.path("recordedEvidence").path("sourceEventDetails")).isEqualTo(mapper.readTree(evidence.path("sourceEventDetails").toString()));
                assertThat(source.path("recordedEvidence").path("navigationContext")).isEqualTo(mapper.readTree(evidence.path("navigationContext").toString()));
                assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,decoded))).isEqualTo(decoded);
                if(number==3)throw new IllegalStateException("CAPTURED_REVIEW");
                var fixture=(tools.jackson.databind.node.ObjectNode)new AdaptiveMarketQuestService(null,null,null,null,null,null,null,null,mapper).schema();
                ((tools.jackson.databind.node.ArrayNode)fixture.path("objectives")).addObject().put("productId","water").put("quantity",1);
                ((tools.jackson.databind.node.ObjectNode)fixture.path("observationPlan")).set("movementEvidenceIds",mapper.valueToTree(List.of(AdaptiveQuestEvidence.ids(evidence,true).stream().sorted().findFirst().orElseThrow())));
                return new GroqChatResult(fixture.toString(),"contract-fixture-budget-only");
            }
        };
        var validator=new MarketAiQuestValidator();
        var service=new AdaptiveMarketQuestService(recommendations,profiles,snapshots,history,mock(MarketAiQuestAuditService.class),validator,new AdaptiveQuestContract(mapper,validator),client,mapper);
        ReflectionTestUtils.setField(service,"tokenBudget",24000);
        assertThatThrownBy(()->service.generate(member,context,stage->{})).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(calls.get()).isEqualTo(3);
        Files.writeString(recordOutput().resolve("three-play-transport-budget-check.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
    }

    @Test void persisted_actual_requests_stay_within_request_budget() throws Exception {
        Path run=Path.of("../output/adaptive-five-persona-20261012");
        Path file=run.resolve("auditor/generations.json");
        Assumptions.assumeTrue(Files.exists(file));
        var report=mapper.createArrayNode();
        for(var generation:mapper.readTree(Files.readString(file))) for(var attempt:generation.path("attempts")) {
            var details=attempt.path("validationDetails");
            if(!details.path("submittedPrompt").isString())continue;
            String system=details.path("systemPrompt").asString(),prompt=details.path("submittedPrompt").asString();
            int output=system.startsWith("Respond in Korean. Read the original")?1200:system.startsWith("You review a proposed")?1000:2600;
            int input=QwenTokenCounter.inputTokens(system,prompt);
            report.addObject().put("generationId",generation.path("id").asString()).put("version",generation.path("prompt_version").asString())
                .put("attempt",attempt.path("sequence").asInt()).put("inputTokens",input).put("outputMax",output).put("requiredTokens",input+output+32);
            assertThat(input+output+32).isLessThanOrEqualTo(24000);
            var packed=mapper.readTree(prompt);
            if(packed.has("finalSourceEncodingVersion") && !system.startsWith("Respond in Korean. Read the original")) {
                var decoded=AdaptiveQuestTransport.decode(mapper,packed);
                assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,decoded))).isEqualTo(decoded);
            }
        }
        assertThat(report.size()).isGreaterThan(0);
        Files.writeString(recordOutput().resolve("actual-generation-token-audit.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
    }
    private Path recordOutput() throws java.io.IOException {
        var output=Path.of(System.getenv().getOrDefault("ONEULDO_TEST_RECORD_OUTPUT","build/test-records/adaptive-transport"));
        Files.createDirectories(output);return output;
    }
}
