package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
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

/** Same saved real-play source, new model calls. No new gameplay or production database writes. */
@EnabledIfEnvironmentVariable(named="AI_SPEED_QUALITY_LIVE",matches="true")
class AnalysisSpeedQualityLiveTest {
 final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
 final Path out=Path.of("../output/analysis-speed-quality-20261013");
 final AnalysisCheckpointStore keyStore=new AnalysisCheckpointStore(org.mockito.Mockito.mock(oneuldo.behaviorlog.analysis.repository.AiAnalysisCheckpointRepository.class),mapper);
 String cacheKey(String system,String prompt,int output) {
  return ReflectionTestUtils.invokeMethod(keyStore,"key",UUID.fromString("00000000-0000-0000-0000-000000000001"),
   UUID.fromString("b9a9e52e-729a-403f-bc6f-3d26460b70fc"),system,prompt,output);
 }
 void save(String name,Object value)throws Exception{Files.createDirectories(out);Files.writeString(out.resolve(name+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n");}
 @Test void same_minsu_original_has_complete_read_coverage_valid_review_and_shared_reuse() throws Exception {
  var file=Path.of("../output/persona15-frozen-20261013/auditor/input-snapshots.json");String original=Files.readString(file);String before=QwenTokenCounter.textHash(original);
  var row=mapper.readTree(original).valueStream().filter(r->r.path("id").asString().equals("b9a9e52e-729a-403f-bc6f-3d26460b70fc")).findFirst().orElseThrow();
  var input=mapper.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);
  var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
  var properties=new java.util.Properties();try(var reader=Files.newBufferedReader(Path.of("../output/persona15-frozen-20261013/application-runtime.private.properties"))){properties.load(reader);}
  var props=new OllamaProperties("http://127.0.0.1:18085","qwen3.6:27b-q4_K_M",24576,Duration.ofMinutes(30),Duration.ofMinutes(10),8,"10m",properties.getProperty("ai.ollama.api-key"),Duration.ofSeconds(10),2,Duration.ofSeconds(1),2);
  var factory=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());factory.setReadTimeout(Duration.ofMinutes(30));
  var actual=new RestOllamaChatClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(factory).build(),props);
  assertThat(actual.maxConcurrency()).isEqualTo(2);assertThat(actual.supportsSourceSchemas()).isTrue();
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",24000);ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
  var prompts=new AiBehaviorAnalysisPromptFactory(mapper);var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
  var responses=new ConcurrentHashMap<String,GroqChatClient.GroqChatResult>();
  boolean resume="true".equals(System.getenv("AI_SPEED_QUALITY_RESUME"));
  if(resume) {
   var prior=mapper.readTree(Files.readString(out.resolve("attempt-01-cold/live-start.json")));
   assertThat(prior.path("sourceSha256").asString()).isEqualTo(before);
   assertThat(prior.path("version").asString()).isEqualTo(AiBehaviorAnalysisPromptFactory.VERSION);
   for(var saved:mapper.readTree(Files.readString(out.resolve("validated-response-checkpoints.json")))) {
    var value=new GroqChatClient.GroqChatResult(saved.path("rawOutput").asString(),props.model(),saved.path("finishReason").asString(),saved.path("inputTokens").asInt(),saved.path("outputTokens").asInt(),saved.path("latencyMs").asLong());
    responses.put(cacheKey(saved.path("systemPrompt").asString(),saved.path("inputPrompt").asString(),saved.path("outputMax").asInt()),value);
   }
  }
  AnalysisCheckpoints checkpoints=new AnalysisCheckpoints(){
   public Optional<GroqChatClient.GroqChatResult> find(String s,String p,int o){return Optional.ofNullable(responses.get(cacheKey(s,p,o)));}
   public void save(String s,String p,int o,GroqChatClient.GroqChatResult r){responses.putIfAbsent(cacheKey(s,p,o),r);}
  };
  var shared=new SharedSourceObservations(mapper,checkpoints,response,prompts,validator,budget.chunkOutputTokens());
  if(resume) {
   var refs=new AnalysisReferences(mapper,response);var ids=SharedSourceObservations.eventList(response);
   var originals=new ArrayList<SharedSourceObservations.Part>();var reductions=new ArrayList<SharedSourceObservations.Part>();
   for(var saved:mapper.readTree(Files.readString(out.resolve("validated-response-checkpoints.json")))) {
    if(!prompts.observationSystem().equals(saved.path("systemPrompt").asString()))continue;
    String encoded=saved.path("inputPrompt").asString();
    var root=new LosslessTables(mapper).decode(mapper.readTree(encoded.substring(0,encoded.lastIndexOf('}')+1)));
    var covered=new ArrayList<UUID>();
    if(root.has("behaviorTimeline")) {
     var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(root.path("behaviorTimeline"));
     for(var session:timeline.path("sessions"))for(var event:session.path("events"))covered.add(ids.get(Integer.parseInt(event.path("behaviorLogId").asString().substring(1))-1));
    }else if(root.has("chunkScopes")) {
     for(var scope:root.path("chunkScopes"))for(var session:scope.path("sessions")) {
      int from=Integer.parseInt(session.path("firstEventId").asString().substring(1))-1,to=Integer.parseInt(session.path("lastEventId").asString().substring(1));
      covered.addAll(ids.subList(from,to));
     }
    }else continue;
    var part=new SharedSourceObservations.Part(covered,refs.readDigest(saved.path("rawOutput").asString()));
    validator.validateDigest(part.digest(),shared.scope(covered));
    (root.has("behaviorTimeline")?originals:reductions).add(part);
   }
   // Restore the artifact saved before the failed final review. Coverage/order/citations are revalidated.
   shared.save(originals,reductions,props.model());save("shared-observation-artifact",shared.load().orElseThrow());
  }
  var audit=new ArrayList<AiBehaviorAnalysisRun.Attempt>();long started=System.nanoTime();
  save("live-start",Map.of("sourceFile",file.toString(),"sourceSha256",before,"datasetId",input.datasetId(),"eventCount",input.eventCount(),"version",AiBehaviorAnalysisPromptFactory.VERSION,"newGameplay",false,"applicationCacheCold",!resume,"parallelism",2));
  var pipeline=new TimelineAnalysisPipeline(prompts,validator,actual,mapper,64,budget,new AnalysisCallPacer()).withQualityReview(true).withPlanSemanticReview(true).withCheckpoints(checkpoints).withSharedObservations(shared).withObservationParallelism(2);
  try(var progress=AnalysisProgress.bind(u->{try{save("live-progress",u);}catch(Exception e){throw new RuntimeException(e);}})) {
   AiBehaviorAnalysis result=pipeline.analyze(response,24000,audit);
   save("cold-analysis",result);validator.validate(result,response);
   assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("FAILURE");
   var doc=shared.load().orElseThrow();save("shared-observation-artifact",doc);
   assertThat(doc.originalParts().stream().flatMap(p->p.eventIds().stream()).toList()).isEqualTo(SharedSourceObservations.eventList(response));
   save("shared-quest-observations",shared.forQuest(doc));
   save("cold-result",Map.of("status","READY","wallSeconds",(System.nanoTime()-started)/1e9,"actualModelResponses",audit.stream().filter(a->a.rawOutput()!=null&&!a.source().contains("CHECKPOINT")&&!a.source().equals("SHARED_OBSERVATIONS")).count(),"sourceSha256",before,"fullOriginalCoverage",true,"sourceUntouched",before.equals(QwenTokenCounter.textHash(Files.readString(file))),"oldPipelineSeconds",1290.797,"applicationCacheCold",!resume,"scope","Same saved source reanalysis, not a new play or learning sample; resumed wall time excludes the preserved first failed cold attempt"));
  }catch(Exception|AssertionError e){save("cold-error",Map.of("error",String.valueOf(e.getMessage()),"wallSeconds",(System.nanoTime()-started)/1e9));throw e;}
  finally{save("cold-attempts",audit);assertThat(QwenTokenCounter.textHash(Files.readString(file))).isEqualTo(before);}
 }
}
