package oneuldo.behaviorlog.analysis;

import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import static org.assertj.core.api.Assertions.*;

class SourceEventDetailsTest {
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    private BehaviorAnalysisInputResponse fixture() {
        var root=new MovementProjectionTest().fixture();
        var events=root.path("input").path("sessions").get(0).path("events");
        for (int i=3;i<=4;i++) {
            ((ObjectNode)events.get(i).path("action")).put("eventCode","SHOP.QUANTITY_CHANGED");
            ((ObjectNode)events.get(i).path("payload")).put("itemId","apple").put("quantityBefore",i-3).put("quantityAfter",i-2);
        }
        ((ObjectNode)events.get(8).path("action")).put("eventCode","SHOP.CHECKOUT_SUBMITTED");
        ((ObjectNode)events.get(8).path("payload").path("marketContent")).putObject("cart").put("apple",2).put("water",1);
        return mapper.convertValue(root,BehaviorAnalysisInputResponse.class);
    }

    @Test void actual_wire_keeps_event_objects_and_zero_values_after_all_encoders() {
        var input=fixture();String before=mapper.writeValueAsString(input);
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);var refs=new AnalysisReferences(mapper,input);
        var wire=mapper.readTree(refs.encode(factory.observationPrompt(input,input)));
        var details=wire.path(SourceEventDetails.FIELD);
        assertThat(details.isArray()).isTrue();assertThat(details.size()).isEqualTo(3);
        assertThat(details.get(0).path("id").asString()).isEqualTo("E4");
        assertThat(details.get(0).path("sequence").asInt()).isEqualTo(input.input().sessions().getFirst().events().get(3).sequence());
        assertThat(details.get(0).path("itemId").asString()).isEqualTo("apple");
        assertThat(details.get(0).path("quantityBefore").asInt()).isZero();
        assertThat(details.get(1).path("quantityAfter").asInt()).isEqualTo(2);
        assertThat(details.get(2).path("cart").path("water").asInt()).isEqualTo(1);
        assertThat(details.get(2).has("quantityBefore")).isFalse();
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
        var direct=mapper.readTree(refs.encode(factory.userPrompt(input)));
        assertThat(direct.path(SourceEventDetails.FIELD)).isEqualTo(details);
        var whole=mapper.readTree(refs.encode(factory.wholeSourcePrompt(input)));
        assertThat(whole.path(SourceEventDetails.FIELD)).isEqualTo(details);
        var expanded=new CompactBehaviorTimeline(mapper).decodeExpanded(new LosslessTables(mapper).decode(wire).path("behaviorTimeline"));
        assertThat(expanded.path("sessions").get(0).path("events").size()).isEqualTo(12);
    }

    @Test void final_receives_uncited_source_values_even_when_digest_denies_selection() {
        var input=fixture();var refs=new AnalysisReferences(mapper,input);var first=input.input().sessions().getFirst().events().getFirst().behaviorLogId();
        var digest=new AiObservationDigest("상품 선택 기록 없음",List.of(new AiObservationDigest.Observation(
                "사과를 담지 않음","선택 어려움 가능성",List.of("기록 누락 가능성"),List.of(first))),List.of("부분 기록"));
        var wire=new FinalSourceEncoding(mapper).decode(mapper.readTree(AnalysisSynthesisPrompt.build(mapper,new AiBehaviorAnalysisPromptFactory(mapper),input,List.of(digest),refs,false)));
        assertThat(wire.path(SourceEventDetails.FIELD).get(1).path("quantityAfter").asInt()).isEqualTo(2);
        var expanded=wire;
        assertThat(expanded.path("evidenceReferences").toString()).contains("E4","E5","E9");
        assertThat(expanded.path("chunkAnalyses").get(0).path("summary").asString()).isEqualTo("상품 선택 기록 없음");
        assertThat(expanded.path("stage").asString()).isEqualTo(AnalysisSynthesisPrompt.FINAL_STAGE);
    }

    @Test void scope_and_lifecycle_values_survive_final_transport_without_changing_old_records() {
        var tree=(ObjectNode)mapper.valueToTree(fixture());
        var session=(ObjectNode)tree.path("input").path("sessions").get(0);
        var end=(ObjectNode)session.path("events").get(11);
        ((ObjectNode)end.path("action")).put("eventCode","SHOP.SESSION_ENDED");
        end.putObject("sessionEnd").put("reason","USER_ABORTED").put("interruptionCount",0).put("interruptionTimeMs",0);
        end.putObject("task").put("taskVersion","market-micro-behavior-v2-content");
        var input=mapper.convertValue(tree,BehaviorAnalysisInputResponse.class);
        var original=mapper.writeValueAsString(input);
        var full=input.input().sessions().getFirst();var events=full.events().subList(0,6);
        var part=new BehaviorAnalysisInputResponse(input.id(),input.schemaVersion(),input.generatedAt(),1,6,
                new BehaviorAnalysisInput(input.input().schemaVersion(),input.id(),input.generatedAt(),input.input().analysisWindow(),
                        input.input().anonymousSubjectId(),1,6,List.of(new BehaviorAnalysisInput.SessionTimeline(
                        full.sessionId(),full.startedAt(),full.endedAt(),full.integrity(),events))));
        var digest=new AiObservationDigest("부분 관찰",List.of(),List.of("이 구간의 한계"));
        var wire=new FinalSourceEncoding(mapper).decode(mapper.readTree(AnalysisSynthesisPrompt.build(mapper,new AiBehaviorAnalysisPromptFactory(mapper),input,
                List.of(digest),new AnalysisReferences(mapper,input),false,List.of(part))));
        var expanded=wire;
        assertThat(expanded.path("sourceCoverage").path("providedEventCount").asInt()).isEqualTo(12);
        assertThat(expanded.path("chunkScopes").get(0).path("providedEventCount").asInt()).isEqualTo(6);
        assertThat(expanded.path("chunkScopes").get(0).path("partial").asBoolean()).isTrue();
        var endings=wire.path(SourceEventDetails.FIELD).findValues("sessionEnd");
        assertThat(endings).hasSize(1);assertThat(endings.getFirst().path("reason").asString()).isEqualTo("USER_ABORTED");
        assertThat(expanded.path(SourceEventDetails.FIELD).toString()).contains("market-micro-behavior-v2-content");
        assertThat(mapper.writeValueAsString(input)).isEqualTo(original);
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="AI_SOURCE_REPORT", matches=".+")
    void recorded_live_observation_matches_the_current_production_prompt() throws Exception {
        var input=mapper.readValue(java.nio.file.Files.readString(java.nio.file.Path.of(
                System.getenv().getOrDefault("AI_SOURCE_FIXTURE_DIR","../tmp/persona-loop-20260914"),"round2-input.json")),
                BehaviorAnalysisInputResponse.class);
        var s=input.input().sessions().getFirst();var events=s.events().subList(102,255);
        var part=new BehaviorAnalysisInputResponse(input.id(),input.schemaVersion(),input.generatedAt(),1,events.size(),
                new BehaviorAnalysisInput(input.input().schemaVersion(),input.id(),input.generatedAt(),input.input().analysisWindow(),
                        input.input().anonymousSubjectId(),1,events.size(),List.of(new BehaviorAnalysisInput.SessionTimeline(
                        s.sessionId(),s.startedAt(),s.endedAt(),s.integrity(),events))));
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        var current=mapper.readTree(new AnalysisReferences(mapper,input).encode(factory.observationPrompt(part,input)));
        var report=mapper.readTree(java.nio.file.Files.readString(java.nio.file.Path.of(System.getenv("AI_SOURCE_REPORT"))));
        var call=report.path("calls").get(0);
        var recorded=mapper.readTree(call.path("inputPrompt").asString().split("\\n구간 2/3:",2)[0]);
        assertThat(current).isEqualTo(recorded);
        assertThat(factory.observationSystem()).isEqualTo(call.path("systemPrompt").asString());
    }
}
