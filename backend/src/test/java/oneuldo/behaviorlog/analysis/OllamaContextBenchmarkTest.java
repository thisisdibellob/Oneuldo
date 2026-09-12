package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.time.*;import java.net.http.HttpClient;import java.util.*;
import oneuldo.ai.client.*;import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;import org.springframework.test.util.ReflectionTestUtils;import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;import tools.jackson.databind.node.*;
import static org.assertj.core.api.Assertions.assertThat;

/** Explicit synthetic-only benchmark; application DB and production settings are not modified. */
@EnabledIfEnvironmentVariable(named="OLLAMA_CONTEXT_BENCHMARK",matches="true")
class OllamaContextBenchmarkTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 final Path folder=Path.of("../output/ollama-context-check");final ObjectNode report=m.createObjectNode();
 final RestClient http=http();
 RestClient http(){var f=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());f.setReadTimeout(Duration.ofMinutes(15));return RestClient.builder().baseUrl("http://127.0.0.1:11435").requestFactory(f).build();}
 void save(){try{Files.writeString(folder.resolve("report.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(report));}catch(Exception e){throw new IllegalStateException(e);}}
 Object memory(){try{return http.get().uri("/api/ps").retrieve().body(Object.class);}catch(Exception e){return Map.of("unavailable",e.getClass().getSimpleName());}}
 BehaviorAnalysisInputResponse expand(ObjectNode source,int n){
  var root=source.deepCopy();var session=(ObjectNode)root.path("sessions").get(0);var old=session.path("events");var events=m.createArrayNode();events.add(old.get(0).deepCopy());
  var start=m.treeToValue(session.path("startedAt"),Instant.class);
  for(int i=0;i<n;i++){
   var e=(ObjectNode)old.get(1).deepCopy();
   e.put("behaviorLogId",UUID.nameUUIDFromBytes(("benchmark-event-"+i).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString());
   e.put("clientEventId",UUID.nameUUIDFromBytes(("benchmark-client-"+i).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString());
   var action=(ObjectNode)e.path("action");action.put("eventCode","SHOP.MOVEMENT_SAMPLED");action.put("microActionId","MOVE");action.remove("stepOutcome");
   var p=(ObjectNode)e.path("payload");for(String key:List.of("quantityBefore","quantityAfter","selectedQuantity","itemId","requiredQuantity","priceAmount"))p.remove(key);
   p.put("x",Math.round((20+Math.sin(i*0.17)*10)*1000)/1000.0);p.put("y",Math.round((20+Math.cos(i*0.13)*10)*1000)/1000.0);p.put("controlMode","TOUCH");p.put("blocked",false);events.add(e);
  }
  for(int i=1;i<old.size();i++)events.add(old.get(i).deepCopy());
  for(int i=0;i<events.size();i++){var e=(ObjectNode)events.get(i);e.put("sequence",i+1);e.put("occurredAt",start.plusSeconds(i*2L).toString());e.put("receivedAt",start.plusSeconds(i*2L+1).toString());e.put("elapsedFromSessionStartMs",i*2000L);((ObjectNode)e.path("action")).put("stepOrder",i+1);}
  session.set("events",events);session.put("endedAt",start.plusSeconds((events.size()-1)*2L).toString());var integrity=(ObjectNode)session.path("integrity");integrity.put("highestEventSequence",events.size());integrity.put("receivedEventCount",events.size());
  root.put("eventCount",events.size());root.put("generatedAt",start.plusSeconds(events.size()*2L+10).toString());((ObjectNode)root.path("analysisWindow")).put("to",start.plusSeconds(events.size()*2L+10).toString());
  var data=m.readValue(root.toString(),BehaviorAnalysisInput.class);return new BehaviorAnalysisInputResponse(data.datasetId(),data.schemaVersion(),data.generatedAt(),1,events.size(),data);
 }
 @Test void compare() throws Exception {
  var source=(ObjectNode)m.readTree(Files.readString(folder.resolve("source.json")));var prompts=new AiBehaviorAnalysisPromptFactory(m);
  BehaviorAnalysisInputResponse input=null;int tokens=0;
  for(int n=20;n<=1000;n+=20){input=expand(source,n);tokens=QwenTokenCounter.inputTokens(prompts.systemPrompt(),new AnalysisReferences(m,input).encode(prompts.userPrompt(input)));if(tokens>=9000)break;}
  assertThat(tokens).isBetween(9000,12000);
  report.put("synthetic",true);report.put("startedAt",Instant.now().toString());report.put("inputTokensEstimated",tokens);report.put("eventCount",input.eventCount());report.put("memoryLimitations","Ollama allocation, not OS RAM or swap; timings include model/context loading");report.set("input",m.valueToTree(input));var runs=report.putArray("runs");save();
  System.out.println("CONTEXT_BENCH prepared events="+input.eventCount()+" tokens="+tokens);
  try{
   for(int ctx:new int[]{16384,8192}){
    int limit=ctx==16384?14000:7000;var run=runs.addObject();run.put("context",ctx);run.put("requestBudget",limit);run.put("status","RUNNING");run.set("memoryBefore",m.valueToTree(memory()));var calls=run.putArray("calls");save();
    var actual=new RestOllamaChatClient(http,new OllamaProperties("http://127.0.0.1:11435","qwen3.6:27b-q4_K_M",ctx,Duration.ofMinutes(15),Duration.ofMinutes(10),8,"10m"));
    GroqChatClient traced=new GroqChatClient(){
     public GroqChatResult complete(String s,String p){return complete(s,p,256,0.7);}
     public GroqChatResult complete(String s,String p,int out,double temperature){var c=calls.addObject();c.put("startedAt",Instant.now().toString());c.put("inputTokensEstimated",QwenTokenCounter.inputTokens(s,p));c.put("outputMax",out);save();System.out.println("CONTEXT_BENCH ctx="+ctx+" call="+calls.size()+" input="+QwenTokenCounter.inputTokens(s,p)+" output="+out);var result=actual.complete(s,p,out,temperature);c.set("response",m.valueToTree(result));c.set("memoryAfter",m.valueToTree(memory()));save();return result;}
    };
    var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"model","qwen3.6:27b-q4_K_M");ReflectionTestUtils.setField(budget,"requestTokens",limit);ReflectionTestUtils.setField(budget,"finalOutputTokens",1800);
    var pipeline=new TimelineAnalysisPipeline(prompts,new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),traced,m,64,budget,new AnalysisCallPacer());var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();long start=System.nanoTime();
    try{run.set("analysis",m.valueToTree(pipeline.analyze(input,limit,audit)));run.put("status","READY");}catch(Exception e){run.put("status","FAILED");run.put("error",e.getMessage());}finally{run.put("elapsedMs",(System.nanoTime()-start)/1000000);run.set("audit",m.valueToTree(audit));run.set("memoryAfter",m.valueToTree(memory()));save();}
    System.out.println("CONTEXT_BENCH finished ctx="+ctx+" status="+run.path("status").asString());
   }
  }finally{
   try{http.post().uri("/api/chat").body(Map.of("model","qwen3.6:27b-q4_K_M","messages",List.of(Map.of("role","user","content","테스트 종료")),"think",false,"stream",false,"keep_alive","10m","options",Map.of("num_ctx",8192,"num_predict",1))).retrieve().body(Object.class);report.put("restoredContext",8192);}catch(Exception e){report.put("restoreError",e.getClass().getSimpleName());}
   report.put("finishedAt",Instant.now().toString());save();
  }
  assertThat(runs.get(0).path("status").asString()).isEqualTo("READY");
 }
}
