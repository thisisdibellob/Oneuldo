package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;import java.util.concurrent.atomic.AtomicInteger;
import oneuldo.ai.client.*;import oneuldo.ai.exception.AiInputLimitException;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.*;import org.springframework.test.util.ReflectionTestUtils;import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
/** A play whose source context alone cannot fit the final request must fail before any model call. */
class FinalEvidencePreflightTest {
 static final Path CASES=Path.of("../output/source-ledger-nine-20261024/cases");
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 static final class Reached extends RuntimeException {}
 BehaviorAnalysisInputResponse input(String key) throws Exception {
  var file=CASES.resolve(key).resolve("input.json");Assumptions.assumeTrue(Files.exists(file));
  var i=m.readValue(Files.readString(file),BehaviorAnalysisInput.class);
  return new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
 }
 TimelineAnalysisPipeline pipeline(AtomicInteger calls,int limit) {
  GroqChatClient client=new GroqChatClient(){
   public boolean supportsSourceSchemas(){return true;} public boolean supportsCompactSourceSchemas(){return true;}
   public boolean supportsConcretePracticeSchemas(){return true;}
   public GroqChatResult complete(String s,String p){calls.incrementAndGet();throw new Reached();}
   public GroqChatResult complete(String s,String p,int o,double t){calls.incrementAndGet();throw new Reached();}
   public GroqChatResult completeDigest(String s,String p,int o,double t){calls.incrementAndGet();throw new Reached();}
   public GroqChatResult completeStructured(String s,String p,int o,double t,Object schema){calls.incrementAndGet();throw new Reached();}
  };
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",limit);
  ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",2400);
  return new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,m,64,budget,new AnalysisCallPacer())
    .withQualityReview(true).withPlanSemanticReview(true).withDirectSourceReview(true).withObservationParallelism(1);
 }
 @Test void oversized_source_context_fails_before_any_model_call() throws Exception {
  var input=input("adult-minjae-unit-support-research-v2-3-baseline-post");var calls=new AtomicInteger();var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
  assertThatThrownBy(()->pipeline(calls,18000).analyze(input,18000,audit))
    .isInstanceOf(AiInputLimitException.class).hasMessageContaining("FINAL_EVIDENCE_EXCEEDS_LIMIT");
  assertThat(calls.get()).isZero();
  assertThat(audit).hasSize(1);assertThat(audit.getFirst().errorCode()).isEqualTo("FINAL_EVIDENCE_EXCEEDS_LIMIT");
 }
 @Test void fitting_source_context_still_proceeds_to_observation() throws Exception {
  var input=input("adult-minjae-unit-support-research-v2-1-baseline-pre");var calls=new AtomicInteger();
  assertThatThrownBy(()->pipeline(calls,18000).analyze(input,18000,new ArrayList<>())).hasRootCauseInstanceOf(Reached.class);
  assertThat(calls.get()).isPositive();
 }
}
