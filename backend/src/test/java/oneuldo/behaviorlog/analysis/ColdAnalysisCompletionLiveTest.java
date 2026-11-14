package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Fresh JVM, no analysis/checkpoint/artifact reads; same immutable real-play source, no new play. */
@EnabledIfEnvironmentVariable(named="AI_COLD_COMPLETION_LIVE",matches="true")
class ColdAnalysisCompletionLiveTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 final Path out=Path.of("../output/cold-analysis-fix-20261014");
 void save(String name,Object value){try{Files.createDirectories(out);Files.writeString(out.resolve(name+".json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n");}catch(Exception e){throw new RuntimeException(e);}}
 @Test void unchanged_minsu_source_finishes_from_scratch_with_valid_language_and_zero_ai_cache_hits() throws Exception {
  long started=System.nanoTime();
  var file=Path.of("../output/persona15-frozen-20261013/auditor/input-snapshots.json");String bytes=Files.readString(file),hash=QwenTokenCounter.textHash(bytes);
  assertThat(hash).isEqualTo("b8fe54df8bef780c12e1e78c8f347baaf1e010f218a50ff658af4bf10bf3b084");
  var row=m.readTree(bytes).valueStream().filter(r->r.path("id").asString().equals("b9a9e52e-729a-403f-bc6f-3d26460b70fc")).findFirst().orElseThrow();
  var input=m.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
  var privateProps=new Properties();try(var reader=Files.newBufferedReader(Path.of("../output/persona15-frozen-20261013/application-runtime.private.properties"))){privateProps.load(reader);}
  var props=new OllamaProperties("http://127.0.0.1:18085","qwen3.6:27b-q4_K_M",24576,Duration.ofMinutes(30),Duration.ofMinutes(10),8,"10m",privateProps.getProperty("ai.ollama.api-key"),Duration.ofSeconds(10),2,Duration.ofSeconds(1),1);
  var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());http.setReadTimeout(Duration.ofMinutes(30));
  var actual=new RestOllamaChatClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(http).build(),props);
  assertThat(actual.maxConcurrency()).isEqualTo(1);assertThat(actual.supportsSourceSchemas()).isTrue();
  var calls=new ArrayList<Map<String,Object>>();
  GroqChatClient measured=new GroqChatClient(){
   public int maxConcurrency(){return actual.maxConcurrency();}public boolean supportsSourceSchemas(){return true;}
   public GroqChatResult complete(String s,String p){return complete(s,p,256,.2);}
   public GroqChatResult complete(String s,String p,int o,double t){return perform(s,p,o,t,null);}
   public GroqChatResult completeDigest(String s,String p,int o,double t){return perform(s,p,o,t,ObservationOutputSchema.VALUE);}
   public GroqChatResult completeStructured(String s,String p,int o,double t,Object schema){return perform(s,p,o,t,schema);}
   private GroqChatResult perform(String s,String p,int o,double t,Object schema){
    long begin=System.nanoTime();GroqChatResult r=schema==null?actual.complete(s,p,o,t):actual.completeStructured(s,p,o,t,schema);
    var record=new LinkedHashMap<String,Object>();record.put("number",calls.size()+1);record.put("systemPrompt",s);record.put("inputPrompt",p);record.put("rawOutput",r.text());record.put("inputTokens",r.inputTokens());record.put("outputTokens",r.outputTokens());record.put("finishReason",r.finishReason());record.put("wallSeconds",(System.nanoTime()-begin)/1e9);record.put("timing",actual.lastTiming());record.put("structured",schema!=null);calls.add(record);save("model-calls",calls);return r;
   }
  };
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",24000);ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
  var prompts=new AiBehaviorAnalysisPromptFactory(m);var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());var reads=new AtomicInteger();
  AnalysisCheckpoints writeOnly=new AnalysisCheckpoints(){
   public Optional<GroqChatClient.GroqChatResult> find(String s,String p,int o){reads.incrementAndGet();return Optional.empty();}
   public void save(String s,String p,int o,GroqChatClient.GroqChatResult r){if(s.startsWith(SharedSourceObservations.VERSION))saveArtifact(r.text());}
   void saveArtifact(String json){ColdAnalysisCompletionLiveTest.this.save("source-observation-artifact",m.readTree(json));}
  };
  var shared=new SharedSourceObservations(m,writeOnly,response,prompts,validator,1800);
  var pipeline=new TimelineAnalysisPipeline(prompts,validator,measured,m,64,budget,new AnalysisCallPacer()).withQualityReview(true).withPlanSemanticReview(true).withDirectSourceReview(true).withObservationParallelism(1).withCheckpoints(writeOnly).withSharedObservations(shared);
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();
  save("live-start",Map.of("sourceSha256",hash,"datasetId",input.datasetId(),"eventCount",2336,"analysisVersion",AiBehaviorAnalysisPromptFactory.VERSION,"cacheReadsReturnEmpty",true,"newGameplay",false,"modelWeightsResident",true,"promptCacheUnsupportedByRuntime",true,"measurementStart","before source decoding/capability/preparation; excludes Gradle build"));
  try(var progress=AnalysisProgress.bind(update->save("live-progress",Map.of("progress",update,"elapsedSeconds",(System.nanoTime()-started)/1e9)))) {
   var result=pipeline.analyze(response,24000,audit);validator.validate(result,response);
   AnalysisLanguageChecks.validate(m,m.writeValueAsString(Map.of("analysis",result)),calls.getLast().get("rawOutput").toString());
   assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
   assertThat(audit).noneMatch(a->a.source().contains("CHECKPOINT")||a.source().equals("SHARED_OBSERVATIONS"));
   var document=m.readValue(Files.readString(out.resolve("source-observation-artifact.json")),SharedSourceObservations.Document.class);
   assertThat(document.originalParts().stream().flatMap(p->p.eventIds().stream()).toList()).containsExactlyElementsOf(SharedSourceObservations.eventList(response));
   save("analysis",result);save("result",Map.of("status","READY","wallSeconds",(System.nanoTime()-started)/1e9,"actualModelResponses",calls.size(),"originalObservationParts",document.originalParts().size(),"aiCacheHits",0,"fullOrderedOriginalCoverage",true,"sourceSha256",hash,"sourceUntouched",true,"oldFailedColdSeconds",1232.882663917,"scope","Same-source cache-free reanalysis, no new play; model weights resident, all prompt prefixes reprocessed"));
  }catch(Exception|AssertionError e){save("error",Map.of("error",String.valueOf(e.getMessage()),"wallSeconds",(System.nanoTime()-started)/1e9,"actualModelResponses",calls.size()));throw e;}
  finally{save("attempts",audit);assertThat(QwenTokenCounter.textHash(Files.readString(file))).isEqualTo(hash);}
 }
}
