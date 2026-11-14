package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class EmbeddedMissionPlanProvenanceTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private static final Path OWN = Path.of("../output/persona45-mcp-20261013/careful-checker-1/recommendation-1/analysis-repair-diagnostics");
    private static final String FIELD = AnalysisSourceContext.MISSION_PLAN_PROVENANCE;

    @Test void an_input_without_observation_plan_has_identical_content_and_no_extra_tokens() {
        var source = object("""
                {"recordedTasks":[{"sourceEventId":"E1","mission":{"objectives":[{"productId":"banana","quantity":2}],
                "budget":0,"difficulty":2,"timeLimitSeconds":270}}],"sourceEventDetails":[{"id":"E885","eventCode":"SHOP.SESSION_ENDED"}]}
                """);
        String before = source.toString();
        AnalysisSourceContext.addMissionPlanProvenance(mapper,source);
        assertThat(source.toString()).isEqualTo(before);
        assertThat(source.has(FIELD)).isFalse();
        assertThat(QwenTokenCounter.count(source.toString())).isEqualTo(QwenTokenCounter.count(before));
        ((ObjectNode)source.at("/recordedTasks/0/mission")).putNull("observationPlan");
        String withNull = source.toString();
        AnalysisSourceContext.addMissionPlanProvenance(mapper,source);
        assertThat(source.toString()).isEqualTo(withNull);
        assertThat(source.has(FIELD)).isFalse();
        var input = synthetic(false);
        assertThat(AdaptiveQuestEvidence.build(mapper,input.input()).has(FIELD)).isFalse();
        var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        assertThat(new LosslessTables(mapper).decode(mapper.readTree(prompts.observationPrompt(input,input))).has(FIELD)).isFalse();
        var refs = new AnalysisReferences(mapper,input);
        String synthesis = AnalysisSynthesisPrompt.build(mapper,prompts,input,List.of(),refs,false);
        assertThat(new FinalSourceEncoding(mapper).decode(mapper.readTree(synthesis)).has(FIELD)).isFalse();
        assertThat(new FinalSourceEncoding(mapper).decode(mapper.readTree(AnalysisReviewPrompt.build(mapper,synthesis,null,refs))).has(FIELD)).isFalse();
    }

    @Test void provenance_is_additive_and_never_changes_prior_ids_prose_values_order_or_current_mechanics() {
        var source = object("""
                {"recordedTasks":[{"sourceEventId":"E1","mission":{"objectives":[{"productId":"banana","quantity":2}],
                "budget":0,"runtimePlan":{"timeLimitSeconds":270,"flag":false},"observationPlan":{
                "behaviorObservation":"바나나 0→4→0, 종료(E885), instant-rice 미확인 😀 é",
                "behaviorEvidenceIds":["E821","E827","E885"],"priorSessionId":"c0b88ec8-39ec-4ba8-9830-178454cc446a",
                "values":[null,false,0,0.123456789,9007199254740993,"",[],{}],"evaluationFocus":"다음 우유 2개 관찰"}}}],
                "sourceEventDetails":[{"id":"E885","eventCode":"SHOP.MOVEMENT_STOPPED"},{"id":"E1846","eventCode":"SHOP.SESSION_ENDED"}]}
                """);
        var original = source.deepCopy();
        AnalysisSourceContext.addMissionPlanProvenance(mapper,source);
        assertThat(source.path(FIELD).path("paths")).isEqualTo(mapper.valueToTree(List.of("/recordedTasks/0/mission/observationPlan")));
        assertThat(source.path(FIELD).path("rule").asString()).contains("never bind them to this dataset's same-spelled E aliases",
                "originating analysis only", "Current requirements", "same-ID original", "missing origin identity stays unknown");
        var withMarker = source.deepCopy();
        source.remove(FIELD);
        assertThat(source).isEqualTo(original);
        assertThat(source.toString()).isEqualTo(original.toString());
        assertThat(new FinalSourceEncoding(mapper).decode(new FinalSourceEncoding(mapper).encode(withMarker))).isEqualTo(withMarker);
        var outer = mapper.createObjectNode(); outer.set("recordedEvidence",withMarker);
        assertThat(AdaptiveQuestTransport.decode(mapper,AdaptiveQuestTransport.encode(mapper,outer))).isEqualTo(outer);
    }

    @Test void builders_preserve_the_snapshot_and_mechanics_with_explicit_prior_ai_text_exclusions() {
        var input = synthetic(true); var prompts = new AiBehaviorAnalysisPromptFactory(mapper);
        var tables = new LosslessTables(mapper);
        for (String prompt : List.of(prompts.userPrompt(input),prompts.observationPrompt(input,input),prompts.wholeSourcePrompt(input))) {
            var source = (ObjectNode)tables.decode(mapper.readTree(prompt));
            assertPresentPaths(source);
            var expanded = new CompactBehaviorTimeline(mapper).decodeExpanded(source.path("behaviorTimeline"));
            var expected = mapper.valueToTree(input.input()).at("/sessions/0/events/0/payload/marketContent/sceneSnapshot/mission/observationPlan");
            if(source.has(PriorAiPlanText.FIELD)) {
                var copy=expected.deepCopy();((ObjectNode)copy).remove("behaviorObservation");
                assertThat(expanded.at("/sessions/0/events/0/payload/marketContent/sceneSnapshot/mission/observationPlan")).isEqualTo(copy);
            } else assertThat(expanded.at("/sessions/0/events/0/payload/marketContent/sceneSnapshot/mission/observationPlan")).isEqualTo(expected);
        }
        var refs = new AnalysisReferences(mapper,input);
        String synthesis = AnalysisSynthesisPrompt.build(mapper,prompts,input,List.of(),refs,false);
        String review = AnalysisReviewPrompt.build(mapper,synthesis,null,refs);
        var expected = refs.reviewSource().at("/sessions/0/events/0/payload/marketContent/sceneSnapshot/mission/observationPlan");
        assertThat(expected.path("behaviorObservation").asString()).contains("이전 즉석밥");
        expected=expected.deepCopy();((ObjectNode)expected).remove("behaviorObservation");
        for (String prompt : List.of(synthesis,review)) {
            var source = new FinalSourceEncoding(mapper).decode(mapper.readTree(prompt));
            assertPresentPaths(source);
            assertThat(source.at("/taskContext/0/mission/observationPlan")).isEqualTo(expected);
        }
        // A saved pre-fix source is also marked when a new independent review is built.
        var legacy = new FinalSourceEncoding(mapper).decode(mapper.readTree(synthesis)); legacy.remove(FIELD);
        var reviewed = new FinalSourceEncoding(mapper).decode(mapper.readTree(AnalysisReviewPrompt.build(mapper,
                new FinalSourceEncoding(mapper).encode(legacy).toString(),null,refs)));
        assertPresentPaths(reviewed);
        assertThat(reviewed.at("/taskContext/0/mission/observationPlan")).isEqualTo(expected);
    }

    @Test void actual_seoyeon_1846_events_keep_prior_885_plan_separate_in_every_bounded_observation_part() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(OWN.resolve("own-input-snapshots.json")));
        var row = mapper.readTree(Files.readString(OWN.resolve("own-input-snapshots.json"))).get(0);
        var data = mapper.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);
        var input = new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        assertThat(data.eventCount()).isEqualTo(1846);
        assertThat(data.sessions().getFirst().sessionId().toString()).isEqualTo("dfcb901d-d527-4d88-9694-351243d29ff7");
        String originalBytes = Files.readString(OWN.resolve("own-input-snapshots.json"));
        var plan = row.at("/input_data/sessions/0/events/0/payload/marketContent/sceneSnapshot/mission/observationPlan");
        assertThat(plan.path("behaviorObservation").asString()).contains("세션 종료(E885)");
        var evidence = AdaptiveQuestEvidence.build(mapper,data);
        assertThat(evidence.at("/recordedTasks/0/mission/observationPlan")).isEqualTo(plan);
        assertPresentPaths(evidence);
        var noMarker = evidence.deepCopy(); noMarker.remove(FIELD);
        assertThat(AdaptiveQuestEvidence.ids(evidence,false)).isEqualTo(AdaptiveQuestEvidence.ids(noMarker,false));
        var current885 = evidence.at("/navigationContext/sessions/0/movementEventDetails").valueStream()
                .filter(e -> "E885".equals(e.path("id").asString())).findFirst().orElseThrow();
        assertThat(current885.path("eventCode").asString()).isEqualTo("SHOP.MOVEMENT_STOPPED");
        var terminal = evidence.path("sourceEventDetails").valueStream().filter(e -> "E1846".equals(e.path("id").asString())).findFirst().orElseThrow();
        assertThat(terminal.path("eventCode").asString()).isEqualTo("SHOP.SESSION_ENDED");
        var service = new AdaptiveMarketQuestService(null,null,null,null,null,null,null,null,mapper);
        JsonNode readable = ReflectionTestUtils.invokeMethod(service,"readableActions",evidence);
        var parts = AdaptiveQuestObservation.plan(mapper,evidence,readable,24000);
        var report = mapper.createObjectNode().put("scope","Seoyeon recommendation-1 immutable source provenance verification")
                .put("actualModelCalls",0).put("newPlays",0).put("originalEventCount",1846)
                .put("priorPlanLiteralPreserved",true).put("currentE885EventCode",current885.path("eventCode").asString())
                .put("actualTerminalEventId","E1846").put("validatorsUnchanged",true);
        report.set("provenance",evidence.path(FIELD));
        report.put("addedSourceTokens",QwenTokenCounter.count(evidence.toString())-QwenTokenCounter.count(noMarker.toString()));
        var rows = report.putArray("boundedObservationParts");
        int positions = 0;
        for (var part : parts) {
            positions += part.source().path("events").size();
            assertThat(part.requiredTokens()).isLessThanOrEqualTo(24000);
            var decoded = AdaptiveQuestEvidence.decodeObservation(mapper,mapper.readTree(part.prompt()));
            assertThat(decoded.path(FIELD)).isEqualTo(evidence.path(FIELD));
            assertThat(decoded.at("/recordedTasks/0/mission/observationPlan")).isEqualTo(plan);
            rows.addObject().put("part",part.source().path("movementObservationScope").path("part").asInt()).put("requiredTokens",part.requiredTokens())
                    .put("rawPositionRows",part.source().path("events").size()).put("fullPriorPlanAndProvenancePreserved",true);
        }
        assertThat(positions).isEqualTo(evidence.path("events").size());
        report.put("allOriginalPositionRowsPreserved",true);
        var baselineReceipt = mapper.readTree(Files.readString(OWN.getParent().getParent().resolve("baseline-pre/db-receipt.json")));
        assertThat(baselineReceipt.path("eventCount").asInt()).isEqualTo(885);
        report.put("priorOwnBaselineRecordedEvents",885);
        assertThat(Files.readString(OWN.resolve("own-input-snapshots.json"))).isEqualTo(originalBytes);
        Files.writeString(OWN.resolve("embedded-mission-plan-provenance-verification.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
    }

    private void assertPresentPaths(ObjectNode source) {
        assertThat(source.path(FIELD).path("paths").isEmpty()).isFalse();
        for (var path : source.path(FIELD).path("paths")) assertThat(source.at(path.asString()).isMissingNode()).isFalse();
    }
    private ObjectNode object(String json) { return (ObjectNode)mapper.readTree(json); }
    private BehaviorAnalysisInputResponse synthetic(boolean withPlan) {
        var root = mapper.createObjectNode().put("id",UUID.randomUUID().toString()).put("schemaVersion","test")
                .put("generatedAt","2026-10-13T00:00:00Z").put("sessionCount",1).put("eventCount",2);
        var input = root.putObject("input").put("datasetId",root.path("id").asString()).put("schemaVersion","test")
                .put("generatedAt","2026-10-13T00:00:00Z").put("sessionCount",1).put("eventCount",2);
        var session = input.putArray("sessions").addObject().put("sessionId",UUID.randomUUID().toString());
        var events = session.putArray("events");
        for (int i=0;i<2;i++) {
            var event = events.addObject().put("behaviorLogId",UUID.randomUUID().toString()).put("sequence",i+1)
                    .put("elapsedFromSessionStartMs",i*100).put("occurredAt","2026-10-13T00:00:00Z").put("receivedAt","2026-10-13T00:00:00Z");
            event.putObject("action").put("eventCode",i==0?"SHOP.SESSION_STARTED":"SHOP.SESSION_ENDED");
            var payload = event.putObject("payload").put("type","SHOPPING");
            var content = payload.putObject("marketContent");
            if (i==0) {
                var mission = object("{\"objectives\":[{\"productId\":\"banana\",\"quantity\":2}],\"budget\":0,\"difficulty\":2,\"timeLimitSeconds\":270}");
                if (withPlan) mission.set("observationPlan",object("{\"behaviorObservation\":\"종료(E885), 이전 즉석밥 목표는 미확인\",\"behaviorEvidenceIds\":[\"E827\",\"E885\"],\"evaluationFocus\":\"우유 2개 관찰\"}"));
                content.putObject("sceneSnapshot").set("mission",mission);
            }
        }
        return mapper.treeToValue(root,BehaviorAnalysisInputResponse.class);
    }
}
