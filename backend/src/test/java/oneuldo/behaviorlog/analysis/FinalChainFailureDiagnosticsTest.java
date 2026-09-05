package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;

/** Read-only local audit check. No network or DB call. */
@EnabledIfEnvironmentVariable(named="AI_CHAIN_AUDIT_DIAGNOSTIC", matches="true")
class FinalChainFailureDiagnosticsTest {
    @Test void 과거_문자수로_탈락한_완결응답은_완화된_계약을_통과한다() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var report=mapper.readTree(Files.readString(Path.of("build","diagnostics","final-quest-1788602884874","report.json")));
        assertThat(report.path("analysisResponse").path("errorCode").asString()).isEqualTo("INVALID_AI_ANALYSIS");
        int live=0,finalCalls=0,questCalls=0;
        for(var call:report.path("calls")) {
            if(call.path("stage").asString().equals("FINAL")) finalCalls++;
            if(call.path("stage").asString().equals("QUEST")) questCalls++;
            if(call.path("source").asString().equals("LIVE")) {
                live++;
                assertThat(call.path("httpStatus").asInt()).isEqualTo(200);
                assertThat(call.path("finishReason").asString()).isEqualTo("stop");
                assertThat(call.path("usage").path("completion_tokens").asInt()).isLessThan(900);
            }
        }
        assertThat(live).isEqualTo(15);assertThat(finalCalls).isZero();assertThat(questCalls).isZero();
        // Stable aliases suffice for a structural/reference diagnostic; no observation meaning is fabricated or changed.
        List<BehaviorAnalysisInput.EventTimeline> events=new ArrayList<>();
        for(int i=1;i<=244;i++) events.add(mapper.readValue("{\"behaviorLogId\":\""+new UUID(0,i)+"\",\"sequence\":"+i+",\"elapsedFromSessionStartMs\":0}",BehaviorAnalysisInput.EventTimeline.class));
        var now=java.time.Instant.EPOCH;
        var data=new BehaviorAnalysisInput("diagnostic",new UUID(1,0),now,new BehaviorAnalysisInput.AnalysisWindow(now,now),"diagnostic",1,244,
                List.of(new BehaviorAnalysisInput.SessionTimeline(new UUID(2,0),now,now,null,events)));
        var input=new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),now,1,244,data);
        var refs=new AnalysisReferences(mapper,input);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        for(int index:List.of(31,32)) {
            var call=report.path("calls").get(index);
            String prompt=call.path("inputPrompt").asString();
            var request=mapper.readTree(prompt.substring(0,prompt.lastIndexOf('}')+1));
            List<AiObservationDigest> children=new ArrayList<>();
            for(var child:request.path("chunkAnalyses")) children.add(refs.readDigest(child.toString()));
            var digest=refs.readDigest(call.path("rawOutput").asString());
            assertThat(validator.validateDigest(digest,input)).isEqualTo(digest);
            assertThat(digest.observations()).hasSize(2);
            Set<UUID> cited=new HashSet<>();children.forEach(c->c.observations().forEach(o->cited.addAll(o.evidenceEventIds())));
            for(var observation:digest.observations()) {
                assertThat(observation.evidenceEventIds()).hasSizeLessThanOrEqualTo(8);
                assertThat(cited).containsAll(observation.evidenceEventIds());
                assertThat(observation.alternativeExplanations()).hasSize(1);
            }
            assertThat(digest.uncertainties()).hasSize(2);
            assertThat(digest.uncertainties().stream().anyMatch(s->s.length()>60)).isTrue();
            assertThat(validator.validateReduction(digest,input,children)).isEqualTo(digest);
        }
    }
}
