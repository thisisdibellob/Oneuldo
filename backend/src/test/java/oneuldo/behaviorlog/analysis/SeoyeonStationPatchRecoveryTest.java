package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import java.util.function.Function;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SeoyeonStationPatchRecoveryTest {
    private final MovementProjectionTest fixture=new MovementProjectionTest();
    private static final Path OWN=Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-2/analysis-repair-diagnostics");
    private final String nullPatch="{\"patches\":[{\"path\":\"/stationClaims/1\",\"value\":null}]}";
    private final String wholePatch="{\"patches\":[{\"path\":\"/stationClaims\",\"value\":[{\"eventId\":\"E4\",\"stationId\":\"fresh\",\"kind\":\"UNKNOWN\"}]}]}";
    private final String semanticValid="{\"verdict\":\"VALID\",\"checkedDimensions\":[\"SUPPORT_CAPABILITIES\",\"STATION_IDENTITY\",\"UNCERTAIN_CAUSES\"],\"issues\":[]}";

    @Test void literal_mismatches_use_rows_but_absent_sources_missing_coverage_duplicates_and_shape_use_a_whole_array() {
        var candidate=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        var failure=new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID","/stationClaims/0",List.of("E4"));
        ((ObjectNode)candidate.at("/stationClaims/0")).put("kind","shelf");
        assertThat(ReviewStationPatch.prompt(fixture.mapper,source(),candidate.toString(),failure)).contains("stationPatchMode: ROWS");
        for(int variant=0;variant<4;variant++) {
            var bad=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
            if(variant==0) ((tools.jackson.databind.node.ArrayNode)bad.path("stationClaims")).addObject().put("eventId","E999").put("stationId","staff:x").put("kind","employee");
            if(variant==1) ((tools.jackson.databind.node.ArrayNode)bad.path("stationClaims")).removeAll();
            if(variant==2) ((tools.jackson.databind.node.ArrayNode)bad.path("stationClaims")).add(bad.path("stationClaims").get(0).deepCopy());
            if(variant==3) bad.put("stationClaims","malformed");
            String raw=bad.toString();
            assertThat(ReviewStationPatch.prompt(fixture.mapper,source(),raw,failure))
                    .startsWith(source()).contains(raw,"stationPatchMode: WHOLE_ARRAY","Do not return null row patches");
            assertThat(bad.toString()).isEqualTo(raw);
        }
    }

    @Test void malformed_null_is_retained_then_only_a_model_whole_array_and_semantic_recheck_can_succeed() {
        var bad=bad(); var client=client(bad);
        when(client.complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(nullPatch,"mock"),new GroqChatClient.GroqChatResult(wholePatch,"mock"));
        when(client.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(semanticValid,"mock"));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result=call(client,audit,true);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
        assertThat(audit).hasSize(4);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(bad.toString());
        assertThat(audit.get(1).rawOutput()).isEqualTo(nullPatch);
        assertThat(audit.get(1).errorCode()).isEqualTo("INVALID_REVIEW_STATION_PATCH");
        assertThat(audit.get(2).rawOutput()).isEqualTo(wholePatch);
        assertThat(audit.get(2).inputPrompt()).startsWith(source()).contains(bad.toString(),"Repair attempt 2").doesNotContain(nullPatch);
        assertThat(audit.getLast().source()).isEqualTo("PLAN_SOURCE_REVIEW");
        verify(client,times(2)).complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0));
    }

    @Test void three_null_responses_stop_without_deleting_rows_and_transport_errors_are_not_retried() {
        var bad=bad(); var client=client(bad);
        when(client.complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(nullPatch,"mock"));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(()->call(client,audit,false)).hasMessage("INVALID_REVIEW_STATION_PATCH");
        assertThat(audit).hasSize(4);
        assertThat(audit.getFirst().rawOutput()).isEqualTo(bad.toString());
        for(var attempt:audit.subList(1,4)) {
            assertThat(attempt.rawOutput()).isEqualTo(nullPatch);
            assertThat(attempt.inputPrompt()).startsWith(source()).contains(bad.toString());
        }
        verify(client,times(3)).complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0));
        var unavailable=client(bad);
        when(unavailable.complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenThrow(new IllegalStateException("UNRELATED_FAILURE"));
        assertThatThrownBy(()->call(unavailable,new ArrayList<>(),false)).hasMessage("UNRELATED_FAILURE");
        verify(unavailable,times(1)).complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0));
    }

    @Test void a_shape_valid_whole_array_still_cannot_bypass_literal_source_or_independent_semantic_checks() {
        var bad=bad(); var client=client(bad);
        when(client.complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(wholePatch.replace("UNKNOWN","shelf"),"mock"));
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        assertThatThrownBy(()->call(client,audit,false)).hasMessage("REVIEW_STATION_CLAIM_INVALID");
        assertThat(audit).hasSize(4);
        assertThat(audit.get(1).validationFailure().code()).isEqualTo("REVIEW_STATION_CLAIM_INVALID");
        assertThat(audit.get(1).errorCode()).isEqualTo("PATCH_RECHECK_REJECTED");
        var semantic=client(bad);
        when(semantic.complete(eq(ReviewStationPatch.SYSTEM),anyString(),eq(ReviewStationPatch.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult(wholePatch,"mock"));
        when(semantic.complete(eq(AnalysisPlanSemanticReview.system()),anyString(),eq(AnalysisPlanSemanticReview.OUTPUT_TOKENS),eq(0.0)))
                .thenReturn(new GroqChatClient.GroqChatResult("{}","mock"));
        assertThatThrownBy(()->call(semantic,new ArrayList<>(),true)).hasMessage("REVIEW_PLAN_SEMANTIC_FORMAT");
    }

    @Test void actual_seoyeon_null_patch_is_rejected_and_model_array_repairs_only_station_metadata_under_the_same_budget() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(OWN.resolve("own-input-snapshot-2345-original.json")));
        String originalSnapshot=Files.readString(OWN.resolve("own-input-snapshot-2345-original.json"));
        var snapshot=fixture.mapper.readTree(originalSnapshot); if(snapshot.isArray())snapshot=snapshot.get(0);
        var data=fixture.mapper.treeToValue(snapshot.path("input_data"),BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        assertThat(data.eventCount()).isEqualTo(2345);
        assertThat(data.sessions().getFirst().sessionId().toString()).isEqualTo("8e6caef7-ccf9-4727-bee1-c0d7de6a37df");
        var refs=new AnalysisReferences(fixture.mapper,input);
        String originalAnalysis=Files.readString(OWN.resolve("own-analyses-original-after-first-attempt.json"));
        var saved=fixture.mapper.readTree(originalAnalysis).get(0);
        var attempts=saved.path("attempts");if(attempts.isString())attempts=fixture.mapper.readTree(attempts.asString());
        String source=attempts.get(17).path("inputPrompt").asString(), candidate=attempts.get(17).path("rawOutput").asString();
        String nullResponse=attempts.get(18).path("rawOutput").asString();
        var original=fixture.mapper.readTree(candidate);
        assertThatThrownBy(()->ReviewStationPatch.apply(fixture.mapper,candidate,nullResponse)).hasMessage("INVALID_REVIEW_STATION_PATCH");
        assertThatThrownBy(()->AnalysisReviewConsistency.validate(original,refs)).isInstanceOfSatisfying(ReviewEvidenceException.class,
                e->assertThat(e.details()).isEqualTo(new ReviewEvidenceException.Details("REVIEW_STATION_CLAIM_INVALID","/stationClaims/4",List.of("E1969"))));
        var failure=fixture.mapper.treeToValue(attempts.get(17).path("validationFailure"),ReviewEvidenceException.Details.class);
        String prompt=ReviewStationPatch.prompt(fixture.mapper,source,candidate,failure);
        assertThat(prompt).startsWith(source).contains(candidate,"stationPatchMode: WHOLE_ARRAY","\"literalSourceRow\":null","Do not return null row patches");
        String explicitMockModelPatch="""
                {"patches":[{"path":"/stationClaims","value":[
                  {"eventId":"E10","stationId":"common-door","kind":"common-door"},
                  {"eventId":"E19","stationId":"common-door","kind":"common-door"},
                  {"eventId":"E150","stationId":"entrance","kind":"entrance"},
                  {"eventId":"E1903","stationId":"checkout","kind":"checkout"},
                  {"eventId":"E2190","stationId":"staff:employee-1","kind":"employee"}
                ]}]}
                """;
        String repaired=ReviewStationPatch.apply(fixture.mapper,candidate,explicitMockModelPatch);
        var after=fixture.mapper.readTree(repaired);
        for(int i=0;i<4;i++)assertThat(after.path("stationClaims").get(i)).isEqualTo(original.path("stationClaims").get(i));
        var sourceRows=new FinalSourceColumns(fixture.mapper).decode(fixture.mapper.readTree(source).path("stationClaimSources"));
        for(var row:after.path("stationClaims"))assertThat(sourceRows).anySatisfy(recorded->assertThat(recorded).isEqualTo(row));
        assertThatCode(()->AnalysisReviewConsistency.validate(after,refs)).doesNotThrowAnyException();
        ((ObjectNode)after).set("stationClaims",original.path("stationClaims")); assertThat(after).isEqualTo(original);
        ReviewEvidenceException.Details next;
        try { AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,repaired,refs);throw new AssertionError("Original nonstation errors must remain rejected"); }
        catch(ReviewEvidenceException rejected) { next=rejected.details(); }
        assertThat(next.code()).isNotEqualTo("REVIEW_STATION_CLAIM_INVALID");
        int base=new AnalysisTokenBudget().total(ReviewStationPatch.SYSTEM,prompt,ReviewStationPatch.OUTPUT_TOKENS)+512;
        String retry="\nRepair attempt 2: previous patch failed INVALID_REVIEW_STATION_PATCH. Null is not a station-row deletion. Follow stationPatchMode; WHOLE_ARRAY means one /stationClaims array, preserving valid rows and all event/evidence IDs. Original sources/candidate unchanged.";
        int retried=new AnalysisTokenBudget().total(ReviewStationPatch.SYSTEM,prompt+retry,ReviewStationPatch.OUTPUT_TOKENS)+512;
        assertThat(base).isLessThanOrEqualTo(24000);assertThat(retried).isLessThanOrEqualTo(24000);
        assertThat(Files.readString(OWN.resolve("own-input-snapshot-2345-original.json"))).isEqualTo(originalSnapshot);
        assertThat(Files.readString(OWN.resolve("own-analyses-original-after-first-attempt.json"))).isEqualTo(originalAnalysis);
        var report=fixture.mapper.createObjectNode().put("actualModelCalls",0).put("newPlays",0).put("originalEventCount",2345)
                .put("sameOriginalSessionId",data.sessions().getFirst().sessionId().toString()).put("oldNullPatchStillRejected",true)
                .put("validStationRowsPreserved",4).put("candidateGradeAndEvidenceUnchanged",true)
                .put("sourceConsistencyAfterMockModelPatch","VALID").put("baseRequestWith1024OutputAnd512Buffer",base)
                .put("retryRequestWith1024OutputAnd512Buffer",retried).put("actualModelRepairVerified",false);
        report.set("nextUnchangedValidationFailure",fixture.mapper.valueToTree(next));
        Files.writeString(OWN.resolve("station-null-patch-recovery-verification.json"),fixture.mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }

    private ObjectNode bad() {
        var value=new AnalysisReviewConsistencyTest().envelope("wrong-specification");
        ((tools.jackson.databind.node.ArrayNode)value.path("stationClaims")).addObject().put("eventId","E999").put("stationId","staff:x").put("kind","employee");
        return value;
    }
    private BehaviorAnalysisInputResponse input() { return fixture.mapper.treeToValue(new SyntheticAnalysisSmokeLiveTest().fixture("wrong-specification"),BehaviorAnalysisInputResponse.class); }
    private String source() {
        var input=input();var refs=new AnalysisReferences(fixture.mapper,input);
        return AnalysisReviewPrompt.build(fixture.mapper,AnalysisSynthesisPrompt.build(fixture.mapper,new AiBehaviorAnalysisPromptFactory(fixture.mapper),input,List.of(),refs,false),null,refs);
    }
    private GroqChatClient client(ObjectNode bad) {
        var client=mock(GroqChatClient.class);
        when(client.complete(eq(AnalysisReviewPrompt.system()),anyString(),eq(2400),anyDouble())).thenReturn(new GroqChatClient.GroqChatResult(bad.toString(),"mock"));
        return client;
    }
    private AiBehaviorAnalysis call(GroqChatClient client,List<AiBehaviorAnalysisRun.Attempt> audit,boolean semantic) {
        var input=input();var refs=new AnalysisReferences(fixture.mapper,input);var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(fixture.mapper),validator,client,fixture.mapper).withQualityReview(true).withPlanSemanticReview(semantic);
        Function<String,AiBehaviorAnalysis> parse=raw->validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(fixture.mapper,raw,refs)),input);
        return ReflectionTestUtils.invokeMethod(pipeline,"call",AnalysisReviewPrompt.system(),source(),2400,24000,audit,parse,false,3);
    }
}
