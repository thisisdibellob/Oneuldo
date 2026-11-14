package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;
import oneuldo.behaviorlog.analysis.service.*;import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.ai.client.*;import org.junit.jupiter.api.*;import org.springframework.test.util.ReflectionTestUtils;import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class ParallelSourceObservationTest {
 @Test void parallel_children_keep_source_and_audit_order_and_inherit_deadline() throws Exception {
  var path=Path.of("../output/persona15-frozen-20261013/auditor/input-snapshots.json");Assumptions.assumeTrue(Files.exists(path));
  var m=JsonMapper.builder().findAndAddModules().build();var i=m.treeToValue(m.readTree(Files.readString(path)).get(0).path("input_data"),BehaviorAnalysisInput.class);
  var input=new BehaviorAnalysisInputResponse(i.datasetId(),i.schemaVersion(),i.generatedAt(),i.sessionCount(),i.eventCount(),i);
  var prompts=new AiBehaviorAnalysisPromptFactory(m);var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
  var sharing=new SharedSourceObservations(m,AnalysisCheckpoints.NONE,input,prompts,validator,1800);var ids=SharedSourceObservations.eventList(input);
  var chunks=List.of(sharing.scope(ids.subList(0,50)),sharing.scope(ids.subList(50,100)));var both=new CountDownLatch(2);var calls=new AtomicInteger();
  GroqChatClient fake=new GroqChatClient(){
   public int maxConcurrency(){return 2;}
   public GroqChatResult complete(String s,String p){throw new AssertionError("Only observations expected");}
   public GroqChatResult completeDigest(String s,String p,int output,double t){
    calls.incrementAndGet();assertThat(AiOperationDeadline.remaining()).isNotNull();both.countDown();
    try{assertThat(both.await(3,TimeUnit.SECONDS)).isTrue();if(p.contains("구간 1/2"))Thread.sleep(40);}catch(InterruptedException e){throw new RuntimeException(e);}
    return new GroqChatResult("{\"summary\":\"범위 검토\",\"observations\":[],\"uncertainties\":[\"의도는 미확인\"],\"requestedSegmentIds\":[]}","test-model","stop",10,10,1L);
   }
  };
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",24000);
  var pipeline=new TimelineAnalysisPipeline(prompts,validator,fake,m,64,budget,new AnalysisCallPacer()).withObservationParallelism(2);
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
  try(var deadline=new AiOperationDeadline(java.time.Duration.ofSeconds(20))){ReflectionTestUtils.invokeMethod(pipeline,"observeParallel",chunks,input,new AnalysisReferences(m,input),24000,audit);}
  assertThat(calls.get()).isEqualTo(2);assertThat(audit).hasSize(2);assertThat(audit.get(0).number()).isEqualTo(1);assertThat(audit.get(1).number()).isEqualTo(2);
  assertThat(audit.get(0).inputPrompt()).contains("구간 1/2");assertThat(audit.get(1).inputPrompt()).contains("구간 2/2");
 }
}
