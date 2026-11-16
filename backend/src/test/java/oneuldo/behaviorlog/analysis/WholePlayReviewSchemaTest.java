package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;import java.util.concurrent.atomic.AtomicReference;
import oneuldo.ai.client.*;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.*;import org.springframework.test.util.ReflectionTestUtils;import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
/** A play that fits in one request is reviewed against its own timeline: the request must reach the model. */
class WholePlayReviewSchemaTest {
 static final Path CASES=Path.of("../output/source-ledger-nine-20261024/cases");
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 static final class Reached extends RuntimeException {}
 @Test void a_single_request_play_builds_a_review_schema_that_allows_its_timeline_events() throws Exception {
  var file=CASES.resolve("adult-minjae-unit-support-research-v2-1-baseline-pre").resolve("input.json");Assumptions.assumeTrue(Files.exists(file));
  var i=m.readValue(Files.readString(file),BehaviorAnalysisInput.class);
  var input=new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
  var schema=new AtomicReference<Object>();var system=new AtomicReference<String>();
  GroqChatClient client=new GroqChatClient(){
   public boolean supportsSourceSchemas(){return true;} public boolean supportsCompactSourceSchemas(){return true;} public boolean supportsConcretePracticeSchemas(){return true;}
   public GroqChatResult complete(String s,String p){throw new Reached();}
   public GroqChatResult complete(String s,String p,int o,double t){throw new Reached();}
   public GroqChatResult completeDigest(String s,String p,int o,double t){throw new AssertionError("a play that fits must not be split into observation calls");}
   public GroqChatResult completeStructured(String s,String p,int o,double t,Object value){system.set(s);schema.set(value);throw new Reached();}
  };
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",32000);
  ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
  var pipeline=new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(m),new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),client,m,64,budget,new AnalysisCallPacer())
    .withQualityReview(true).withPlanSemanticReview(true).withDirectSourceReview(true).withObservationParallelism(1);
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
  assertThatThrownBy(()->pipeline.analyze(input,32000,audit)).hasRootCauseInstanceOf(Reached.class);
  assertThat(system.get()).isEqualTo(AnalysisReviewPrompt.system());
  String text=m.writeValueAsString(schema.get());
  assertThat(text).contains("\"E1\"").contains("\"E"+i.eventCount()+"\"");
 }
}
