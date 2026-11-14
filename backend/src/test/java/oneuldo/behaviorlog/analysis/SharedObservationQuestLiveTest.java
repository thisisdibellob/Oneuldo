package oneuldo.behaviorlog.analysis;

import java.nio.file.*;import java.time.*;import java.util.*;import java.util.concurrent.*;
import oneuldo.ai.client.*;import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;import oneuldo.behaviorlog.analysis.service.*;import oneuldo.behaviorlog.analysis.repository.*;
import oneuldo.behaviorlog.profile.domain.*;import oneuldo.behaviorlog.profile.service.*;
import oneuldo.behaviorlog.personalization.domain.*;import oneuldo.behaviorlog.personalization.service.*;
import oneuldo.member.domain.Member;
import org.junit.jupiter.api.*;import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;import org.springframework.test.util.ReflectionTestUtils;import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;

/** Real quest model and validators; persistence/profile boundary is an explicitly declared benchmark fixture. */
@EnabledIfEnvironmentVariable(named="AI_SPEED_QUALITY_LIVE",matches="true")
class SharedObservationQuestLiveTest {
 @Test void real_quest_reuses_the_same_validated_original_observations() throws Exception {
  var m=JsonMapper.builder().findAndAddModules().build();var out=Path.of("../output/analysis-speed-quality-20261013");
  Assumptions.assumeTrue(Files.exists(out.resolve("cold-result.json"))&&m.readTree(Files.readString(out.resolve("cold-result.json"))).path("status").asString().equals("READY"));
  var rows=m.readTree(Files.readString(Path.of("../output/persona15-frozen-20261013/auditor/input-snapshots.json")));
  var row=rows.valueStream().filter(r->r.path("id").asString().equals("b9a9e52e-729a-403f-bc6f-3d26460b70fc")).findFirst().orElseThrow();
  var input=m.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
  var propsFile=new Properties();try(var reader=Files.newBufferedReader(Path.of("../output/persona15-frozen-20261013/application-runtime.private.properties"))){propsFile.load(reader);}
  var props=new OllamaProperties("http://127.0.0.1:18085","qwen3.6:27b-q4_K_M",24576,Duration.ofMinutes(30),Duration.ofMinutes(10),8,"10m",propsFile.getProperty("ai.ollama.api-key"),Duration.ofSeconds(10),2,Duration.ofSeconds(1),2);
  var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());http.setReadTimeout(Duration.ofMinutes(30));
  var actual=new RestOllamaChatClient(RestClient.builder().baseUrl(props.baseUrl()).requestFactory(http).build(),props);
  var values=new ConcurrentHashMap<String,GroqChatClient.GroqChatResult>();AnalysisCheckpoints memory=new AnalysisCheckpoints(){
   public Optional<GroqChatClient.GroqChatResult> find(String s,String p,int o){return Optional.ofNullable(values.get(s+p+o));}
   public void save(String s,String p,int o,GroqChatClient.GroqChatResult r){values.putIfAbsent(s+p+o,r);}
  };
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",24000);ReflectionTestUtils.setField(budget,"chunkOutputTokens",1800);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
  var prompts=new AiBehaviorAnalysisPromptFactory(m);var analysisValidator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
  var shared=new SharedSourceObservations(m,memory,response,prompts,analysisValidator,budget.chunkOutputTokens());
  var doc=m.readValue(Files.readString(out.resolve("shared-observation-artifact.json")),SharedSourceObservations.Document.class);shared.save(doc.originalParts(),doc.synthesisParts(),props.model());assertThat(shared.load()).isPresent();
  var analysis=m.readValue(Files.readString(out.resolve("cold-analysis.json")),AiBehaviorAnalysis.class);analysisValidator.validate(analysis,response);
  UUID member=UUID.randomUUID(),profileId=UUID.randomUUID(),analysisId=UUID.randomUUID();
  var profile=new AiUserProfileResponse(profileId,1,null,analysisId,input.datasetId(),input.sessions().getFirst().sessionId(),"READY",props.model(),AiBehaviorAnalysisPromptFactory.VERSION,0,Instant.now(),null,analysis);
  var plan=analysis.practicePlan();var rec=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),input.datasetId(),analysisId,profileId,1,"MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_PROFILE",new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),plan.reasonCodes(),AdaptiveMarketQuestService.VERSION,Instant.now());
  var recommendations=mock(MarketDifficultyRecommendationService.class);when(recommendations.recommend(member)).thenReturn(rec);
  var profiles=mock(AiUserProfileService.class);when(profiles.find(member,profileId)).thenReturn(profile);
  var snapshots=mock(BehaviorAnalysisInputSnapshotRepository.class);when(snapshots.findByIdAndMemberId(input.datasetId(),member)).thenReturn(Optional.of(new BehaviorAnalysisInputSnapshot(mock(Member.class),input)));
  var history=mock(PracticeHistoryService.class);when(history.forProfile(member,profile)).thenReturn(m.createArrayNode());
  var audit=mock(MarketAiQuestAuditService.class);var seen=new ArrayList<MarketAiQuestGeneration.Attempt>();
  doAnswer(call->{seen.clear();seen.addAll(call.getArgument(4));Files.writeString(out.resolve("shared-quest-attempts.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(seen)+"\n");return null;}).when(audit).record(any(),any(),any(),any(),any(),any(),any());
  var validator=new MarketAiQuestValidator();var service=new AdaptiveMarketQuestService(recommendations,profiles,snapshots,history,audit,validator,new AdaptiveQuestContract(m,validator),actual,m);
  var checkpoint=mock(AnalysisCheckpointStore.class);when(checkpoint.scope(member,input.datasetId())).thenReturn(memory);service.setCheckpointStore(checkpoint);service.setObservationReuse(prompts,analysisValidator,budget);
  ReflectionTestUtils.setField(service,"tokenBudget",24000);ReflectionTestUtils.setField(service,"modelIdentity","benchmark:3a40c32f1450b8380412898385b0e00df5d6d2d801dd192ca1acb7e735cd050e:ctx24576");
  long started=System.nanoTime();
  try {
   var result=service.generate(member,null,stage->{try{Files.writeString(out.resolve("shared-quest-progress.json"),m.writeValueAsString(Map.of("stage",stage)));}catch(Exception e){throw new RuntimeException(e);}});
   Files.writeString(out.resolve("shared-quest-response.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(result)+"\n");
   assertThat(result.quest().runtimePlan()).isNotNull();assertThat(result.quest().environmentPlan()).isNotNull();
   assertThat(seen).anyMatch(a->"SHARED_SOURCE_OBSERVATIONS".equals(a.validationDetails().get("stage")));
   assertThat(seen).noneMatch(a->"DEEP_OBSERVATION".equals(a.validationDetails().get("stage")));
   Files.writeString(out.resolve("shared-quest-result.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("status","READY","wallSeconds",(System.nanoTime()-started)/1e9,"reusedOriginalParts",doc.originalParts().size(),"newDeepObservationCalls",0,"scope","Real model quest/validators with persistence and direct validated-analysis profile benchmark fixtures; no new gameplay and no incremental-profile latency included"))+"\n");
  }catch(Exception|AssertionError e){Files.writeString(out.resolve("shared-quest-error.json"),m.writeValueAsString(Map.of("error",String.valueOf(e.getMessage()),"wallSeconds",(System.nanoTime()-started)/1e9)));throw e;}
 }
}
