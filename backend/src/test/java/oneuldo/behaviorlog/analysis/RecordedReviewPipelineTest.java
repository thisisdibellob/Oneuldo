package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Offline orchestration check with a recorded real review; no network, DB or generated user judgment. */
@EnabledIfEnvironmentVariable(named="AI_CLAIM_PIPELINE_REPLAY", matches="true")
class RecordedReviewPipelineTest {
    @Test void full_208_event_pipeline_accepts_recorded_review_within_the_actual_context_budget() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var report=mapper.readTree(Files.readString(Path.of("../output/output-consistency-2026-09-18/live.json")));
        var input=mapper.readValue(Files.readString(Path.of("../output/analysis-request-2026-09-18/input.json")),BehaviorAnalysisInputResponse.class);
        var reference=mapper.convertValue(report.path("analysis"),AiBehaviorAnalysis.class);
        var calls=report.path("attempts");
        String recordedReview=calls.get(calls.size()-1).path("rawOutput").asString();
        GroqChatClient replay=new GroqChatClient() {
            public GroqChatResult complete(String system,String user) {return complete(system,user,1800,0.2);}
            public GroqChatResult complete(String system,String user,int max,double temperature) {
                return new GroqChatResult(system.equals(AnalysisReviewPrompt.system()) ? recordedReview : mapper.writeValueAsString(reference),"offline-recording");
            }
            public GroqChatResult completeDigest(String system,String user,int max,double temperature) {
                // No fabricated intermediate observations. The final prompt still carries all interaction facts.
                return new GroqChatResult("{\"summary\":\"오프라인 예산 검사\",\"observations\":[],\"uncertainties\":[\"요약 모델 호출은 이 검사에서 대체됨\"],\"requestedSegmentIds\":[]}","offline-stub");
            }
        };
        var budget=new AnalysisTokenBudget();
        ReflectionTestUtils.setField(budget,"requestTokens",18000);
        ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);
        ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
        var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var result=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper),
                new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),replay,mapper,64,budget,new AnalysisCallPacer())
                .withQualityReview(true).analyze(input,18000,audit);
        assertThat(result).isEqualTo(reference);
        assertThat(audit.size()).isGreaterThanOrEqualTo(2);
        for(var attempt:audit) assertThat(QwenTokenCounter.inputTokens(attempt.systemPrompt(),attempt.inputPrompt())+attempt.outputMax()).isLessThanOrEqualTo(18000);
        var out=mapper.createObjectNode();out.put("networkCalls",0);out.put("sourceEvents",input.eventCount());out.put("result","PASSED");
        var steps=out.putArray("steps");
        for(var attempt:audit) {
            var step=steps.addObject();step.put("inputTokens",QwenTokenCounter.inputTokens(attempt.systemPrompt(),attempt.inputPrompt()));
            step.put("outputReserve",attempt.outputMax());step.put("review",attempt.systemPrompt().equals(AnalysisReviewPrompt.system()));
        }
        Files.writeString(Path.of("../output/output-consistency-2026-09-18/offline-pipeline-replay.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(out));
    }
}
