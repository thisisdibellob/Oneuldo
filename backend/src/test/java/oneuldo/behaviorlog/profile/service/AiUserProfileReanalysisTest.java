package oneuldo.behaviorlog.profile.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class AiUserProfileReanalysisTest {
    @Test void prose_references_cannot_be_mistaken_for_current_profile_evidence() {
        var mapper=JsonMapper.builder().findAndAddModules().build();var event=UUID.randomUUID();
        var analysis=new AiBehaviorAnalysis("관찰",List.of(new AiBehaviorAnalysis.Finding("F1","수량",
                "사과 2개(E105)","의도는 미확인",List.of("한계"),List.of(event),"목록 확인")),List.of(),List.of("한계"),null);
        var previous=org.mockito.Mockito.mock(AiUserProfile.class);
        org.mockito.Mockito.when(previous.getProfile()).thenReturn(analysis);
        var current=new AiBehaviorAnalysisResponse(UUID.randomUUID(),UUID.randomUUID(),"READY","model","v","v",1,0,Instant.now(),null,analysis);
        var refs=new AiUserProfileReferences(mapper,previous,current);
        var wire=(tools.jackson.databind.node.ObjectNode)mapper.readTree(refs.encode(mapper.writeValueAsString(analysis)));
        assertThat(wire.path("allowedEvidenceEventIds").get(0).asString()).isEqualTo("R1");
        assertThat(wire.path("findings").get(0).path("observation").asString()).isEqualTo("사과 2개(E105)");
        assertThat(wire.path("findings").get(0).path("evidenceEventIds").get(0).asString()).isEqualTo("R1");
        wire.remove(List.of("sessionAssessments","allowedEvidenceEventIds","referenceEncoding"));
        assertThat(refs.read(mapper.writeValueAsString(wire)).findings().getFirst().evidenceEventIds()).containsExactly(event);
        ((tools.jackson.databind.node.ObjectNode)wire.path("findings").get(0)).putArray("evidenceEventIds").add("E105");
        assertThatThrownBy(()->refs.read(mapper.writeValueAsString(wire))).hasMessage("UNKNOWN_PROFILE_EVENT_REFERENCE");
    }

    @Test void distinguishes_a_correction_from_a_new_play_after_reference_encoding() {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var session = UUID.randomUUID();
        var plan = new AiBehaviorAnalysis.PracticePlan(List.of("F1"), "목표", "근거", 1, 2,
                "LOW", "LOW", "SIMPLIFIED", List.of("OBSERVATION_PRACTICE"));
        var old = new AiBehaviorAnalysis("기존 해석", List.of(),
                List.of(new AiBehaviorAnalysis.SessionAssessment(session, "UNDETERMINED", "미확인", List.of())),
                List.of("한계"), plan);
        var previous = new AiUserProfile(UUID.randomUUID(), 2, null, UUID.randomUUID(), UUID.randomUUID(),
                session, "READY", "old", "model", "", "", List.of(), old, null, 0);
        for (boolean same : List.of(true, false)) {
            var currentSession = same ? session : UUID.randomUUID();
            var analysis = new AiBehaviorAnalysis("정정", List.of(), List.of(new AiBehaviorAnalysis.SessionAssessment(
                    currentSession, "SUCCESS", "원본 확인", List.of())), List.of("한계"), plan);
            var current = new AiBehaviorAnalysisResponse(UUID.randomUUID(), UUID.randomUUID(), "READY", "model",
                    "new", "evidence", 2, 0, Instant.now(), null, analysis);
            var wire = mapper.readTree(new AiUserProfileReferences(mapper, previous, current)
                    .encode(new AiUserProfilePromptFactory(mapper).userPrompt(previous, current)));
            assertThat(wire.path("sameSessionReanalysis").asBoolean()).isEqualTo(same);
            assertThat(wire.path("previousSourceSessionId").asString()).isEqualTo("S1");
            assertThat(wire.path("currentAnalysis").path("sessionAssessments").get(0).path("sessionId").asString())
                    .isEqualTo(same ? "S1" : "S2");
            assertThat(wire.path("updateRules").toString()).contains("교육 효과·능력 향상으로 세지 않는다");
        }
    }
}
