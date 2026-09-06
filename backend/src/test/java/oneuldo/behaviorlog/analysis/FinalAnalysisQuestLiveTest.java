package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.AiBehaviorAnalysisRepository;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.domain.*;
import oneuldo.behaviorlog.personalization.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Opt-in live diagnostic: real pipeline/provider/quest service, DB reads only, no production result publishing. */
@EnabledIfEnvironmentVariable(named="AI_FINAL_QUEST_LIVE", matches="true")
class FinalAnalysisQuestLiveTest {
    private static final UUID DATASET=UUID.fromString("dab3a096-1880-4453-8192-8c2cd21100fc");
    private static final UUID MEMBER=UUID.fromString("61c2b6c0-2471-455e-97d4-839957360e44");
    private static final String SOURCE="6af4ded6-29df-4f2d-b694-ae77e53adb98";
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    private final ObjectNode report=mapper.createObjectNode();
    private final Path folder=Path.of("build","diagnostics","final-quest-"+System.currentTimeMillis());
    private final List<Cached> cache=new ArrayList<>();
    private final AnalysisCallPacer livePacer=new AnalysisCallPacer();
    private String key;
    private int liveCalls;
    private record Cached(JsonNode input,String system,int outputMax,String raw,String source) {}

    @Test void 저장구간에서_최종_AI분석과_맞춤퀘스트까지_검증한다() throws Exception {
        Files.createDirectories(folder);
        report.put("startedAt",Instant.now().toString());report.put("datasetId",DATASET.toString());report.put("sourceRunId",SOURCE);
        report.put("promptVersion",AiBehaviorAnalysisPromptFactory.VERSION);report.put("databaseWrites",false);
        report.put("status","RUNNING");report.putArray("calls");write();
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        var data=mapper.readValue(query("SELECT input_data FROM behavior_analysis_input_snapshots WHERE id='"+DATASET+"' AND member_id='"+MEMBER+"';"),BehaviorAnalysisInput.class);
        var input=new BehaviorAnalysisInputResponse(DATASET,data.schemaVersion(),data.generatedAt(),data.sessionCount(),data.eventCount(),data);
        assertThat(input.eventCount()).isEqualTo(244);
        var saved=mapper.readTree(query("SELECT attempts FROM ai_behavior_analyses WHERE id='"+SOURCE+"' AND member_id='"+MEMBER+"';"));
        for(int i=0;i<17;i++) {
            assertThat(saved.get(i).path("errorCode").isNull()).isTrue();
            cache.add(new Cached(canonical(saved.get(i).path("inputPrompt").asString()),factory.observationSystem(),900,
                    saved.get(i).path("rawOutput").asString(),"DB:"+SOURCE+":"+(i+1)));
        }
        Path reduction=Path.of("build","diagnostics","reduce-replay-1788601890645.json");
        var compact=mapper.readTree(Files.readString(reduction));
        assertThat(compact.path("valid").asBoolean()).isTrue();
        assertThat(compact.path("datasetId").asString()).isEqualTo(DATASET.toString());
        cache.add(new Cached(canonical(compact.path("inputPrompt").asString()),compact.path("systemPrompt").asString(),900,
                compact.path("rawOutput").asString(),reduction.toString()));
        Properties local=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("local.properties"))) {local.load(reader);}
        String configuredOtpm=local.getProperty("ai.groq.output-tokens-per-minute",local.getProperty("GROQ_OTPM",System.getenv("GROQ_OTPM")));
        if(configuredOtpm!=null) {
            org.springframework.test.util.ReflectionTestUtils.setField(livePacer,"otpm",Integer.parseInt(configuredOtpm));
            report.put("configuredOtpm",Integer.parseInt(configuredOtpm));
        }
        key=System.getenv("GROQ_API_KEY");
        if(key==null || key.isBlank()) key=local.getProperty("ai.groq.api-key",local.getProperty("GROQ_API_KEY"));
        assertThat(key!=null && !key.isBlank()).as("Local Groq credential required").isTrue();

        var inputs=mock(BehaviorAnalysisInputService.class);
        when(inputs.find(MEMBER,DATASET)).thenReturn(input);
        var repository=mock(AiBehaviorAnalysisRepository.class);
        when(repository.save(any())).thenAnswer(call->{
            AiBehaviorAnalysisRun run=call.getArgument(0);
            report.set("analysisRun",mapper.valueToTree(run));write();return run;
        });
        // The provider wrapper handles pacing for live requests only; cached responses do not consume quota.
        var analysis=new AiBehaviorAnalysisService(inputs,repository,factory,
                new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()),new LiveClient(),mapper,new AnalysisTokenBudget(),mock(AnalysisCallPacer.class),
                mock(oneuldo.behaviorlog.profile.service.AiUserProfileService.class));
        var checkpointRepository=mock(oneuldo.behaviorlog.analysis.repository.AiAnalysisCheckpointRepository.class);
        Map<String,AiAnalysisCheckpoint> persisted=new LinkedHashMap<>();
        when(checkpointRepository.findById(anyString())).thenAnswer(c->Optional.ofNullable(persisted.get(c.getArgument(0))));
        when(checkpointRepository.existsById(anyString())).thenAnswer(c->persisted.containsKey(c.getArgument(0)));
        when(checkpointRepository.saveAndFlush(any())).thenAnswer(c->{
            AiAnalysisCheckpoint value=c.getArgument(0);persisted.put(value.getId(),value);
            report.set("checkpoints",mapper.valueToTree(persisted.values()));write();return value;
        });
        var store=new AnalysisCheckpointStore(checkpointRepository,mapper);analysis.setCheckpointStore(store);
        String resume=System.getenv("AI_CHAIN_RESUME");
        if(resume!=null && !resume.isBlank()) {
            var previous=mapper.readTree(Files.readString(Path.of(resume)));
            assertThat(previous.path("datasetId").asString()).isEqualTo(DATASET.toString());
            for(var c:previous.path("checkpoints")) {
                assertThat(c.path("memberId").asString()).isEqualTo(MEMBER.toString());
                assertThat(c.path("datasetId").asString()).isEqualTo(DATASET.toString());
                store.scope(MEMBER,DATASET).save(c.path("systemPrompt").asString(),c.path("inputPrompt").asString(),c.path("outputMax").asInt(),mapper.readValue(c.path("response").toString(),GroqChatClient.GroqChatResult.class));
            }
            report.put("resumedFrom",resume);write();
        }
        long started=System.nanoTime();
        try {
            var result=analysis.analyzeSnapshot(MEMBER,DATASET);
            report.set("analysisResponse",mapper.valueToTree(result));write();
            assertThat(result.status()).as("Production analysis must be READY before quest generation").isEqualTo("READY");
            verify(inputs).find(MEMBER,DATASET);
            verify(repository).save(any());

            // These are in-memory persistence boundaries, not invented AI responses or a rule-based recommendation.
            var plan=result.analysis().practicePlan();
            UUID profileId=UUID.randomUUID();
            var recommendation=new MarketDifficultyRecommendationResponse(UUID.randomUUID(),DATASET,result.analysisId(),profileId,1,
                    "MARKET_SIMULATION",plan.recommendedDifficulty(),"AI_ANALYSIS",
                    new MarketDifficultyRecommendationResponse.Adjustments(plan.itemCount(),plan.quantityComplexity(),plan.budgetPressure(),plan.textSupport()),
                    plan.reasonCodes(),result.promptVersion(),Instant.now());
            var recommendations=mock(MarketDifficultyRecommendationService.class);
            when(recommendations.recommend(MEMBER)).thenReturn(recommendation);
            var analysisLookup=mock(AiBehaviorAnalysisService.class);
            when(analysisLookup.find(MEMBER,result.analysisId())).thenReturn(result);
            var profiles=mock(oneuldo.behaviorlog.profile.service.AiUserProfileService.class);
            when(profiles.find(MEMBER,profileId)).thenReturn(new oneuldo.behaviorlog.profile.domain.AiUserProfileResponse(
                    profileId,1,null,result.analysisId(),DATASET,UUID.randomUUID(),"READY",result.model(),result.promptVersion(),
                    result.latencyMs(),result.createdAt(),null,result.analysis()));
            var questAudit=mock(MarketAiQuestAuditService.class);
            doAnswer(call->{
                report.set("questAuditResponse",mapper.valueToTree(call.getArgument(2)));
                report.set("questAttempts",mapper.valueToTree(call.getArgument(4)));
                report.set("questError",mapper.valueToTree(call.getArgument(5)));write();return null;
            }).when(questAudit).record(any(),any(),any(),any(),any(),any(),any());
            var quests=new MarketAiQuestService(new MarketAiQuestPromptFactory(mapper),new MarketAiQuestValidator(),
                    recommendations,questAudit,profiles,new LiveClient(),mapper);
            report.set("recommendation",mapper.valueToTree(recommendation));write();
            var quest=quests.generate(MEMBER);
            report.set("questResponse",mapper.valueToTree(quest));
            assertThat(quest.source()).isEqualTo("AI");
            assertThat(quest.analysisId()).isEqualTo(result.analysisId());
            assertThat(quest.quest().difficulty()).isEqualTo(plan.recommendedDifficulty());
            int before=liveCalls;
            var replay=analysis.analyzeSnapshot(MEMBER,DATASET);
            assertThat(replay.status()).isEqualTo("READY");
            assertThat(liveCalls).isEqualTo(before);
            report.put("checkpointReplayVerified",true);
            report.put("status","PASSED");
        } catch(RuntimeException | AssertionError failure) {
            report.put("status","FAILED");report.put("failureType",failure.getClass().getSimpleName());
            throw failure;
        } finally {
            report.put("elapsedMs",(System.nanoTime()-started)/1_000_000);report.put("liveCalls",liveCalls);
            report.put("finishedAt",Instant.now().toString());write();
            System.out.println("FINAL_QUEST_DIAGNOSTIC status="+report.path("status").asString()+" liveCalls="+liveCalls+" report="+folder.toAbsolutePath());
        }
    }
    private final class LiveClient implements GroqChatClient {
        @Override public GroqChatResult complete(String system,String prompt) {return complete(system,prompt,256,0.7);}
        @Override public GroqChatResult complete(String system,String prompt,int output,double temperature) {
            String stage=system.contains("퀘스트 설계자")?"QUEST":prompt.contains("OBSERVE:")?"OBSERVE":prompt.contains("REDUCE:")?"REDUCE":"FINAL";
            ObjectNode call=mapper.createObjectNode();call.put("stage",stage);call.put("systemPrompt",system);call.put("inputPrompt",prompt);call.put("outputMax",output);
            ((tools.jackson.databind.node.ArrayNode)report.path("calls")).add(call);
            for(var saved:cache) if(saved.outputMax==output && saved.system.equals(system) && saved.input.equals(canonical(prompt))) {
                call.put("source","CACHE");call.put("cacheSource",saved.source);call.put("rawOutput",saved.raw);call.put("latencyMs",0);write();
                return new GroqChatResult(saved.raw,"qwen/qwen3.6-27b");
            }
            // A missed raw-observation cache match must not silently trigger another 17-leaf run.
            if(stage.equals("OBSERVE")) {call.put("error","OBSERVATION_CACHE_MISMATCH");write();throw new IllegalStateException("OBSERVATION_CACHE_MISMATCH");}
            call.put("source","LIVE");call.put("state","WAITING");write();
            call.put("localInputTokens",QwenTokenCounter.inputTokens(system,prompt));write();
            if(++liveCalls>20) throw new IllegalStateException("DIAGNOSTIC_CALL_LIMIT");
            long queued=System.nanoTime();
            var reservation=livePacer.acquire(QwenTokenCounter.inputTokens(system,prompt),output);
            call.put("waitMs",(System.nanoTime()-queued)/1_000_000);
            call.put("startedAt",Instant.now().toString());call.put("state","REQUESTING");
            call.put("localInputTokens",QwenTokenCounter.inputTokens(system,prompt));write();
            long started=System.nanoTime();
            try {
                String body=mapper.writeValueAsString(Map.of("model","qwen/qwen3.6-27b","messages",List.of(Map.of("role","system","content",system),Map.of("role","user","content",prompt)),
                        "max_completion_tokens",output,"temperature",temperature,"top_p",0.8,"reasoning_effort","none","reasoning_format","hidden","stream",false));
                var request=HttpRequest.newBuilder(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                        .timeout(Duration.ofSeconds(25)).header("Authorization","Bearer "+key).header("Content-Type","application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body)).build();
                var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
                call.put("latencyMs",(System.nanoTime()-started)/1_000_000);call.put("httpStatus",response.statusCode());call.put("state","RECEIVED");
                if(response.statusCode()!=200) {
                    livePacer.limited(response.headers().map().entrySet().stream().collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,e->e.getValue().getFirst())),response.body());
                    String error=response.body().toLowerCase(Locale.ROOT);
                    call.put("limitKind",error.contains("output tokens per minute")?"OTPM":error.contains("input tokens per minute")?"ITPM":error.contains("tokens per minute")?"TPM":"unknown");
                    var values=java.util.regex.Pattern.compile("(?i)\\b(Limit|Requested|Used)[:= ]+(\\d+)").matcher(response.body());
                    while(values.find()) call.put(values.group(1).toLowerCase(Locale.ROOT),Long.parseLong(values.group(2)));
                    write();
                    if(response.statusCode()==429) throw new oneuldo.ai.exception.CloudAiRateLimitException(response.headers().firstValue("retry-after").orElse(null),null);
                    throw new IllegalStateException("PROVIDER_HTTP_"+response.statusCode());
                }
                var root=mapper.readTree(response.body());var choice=root.path("choices").get(0);
                String raw=choice.path("message").path("content").asString();
                livePacer.completed(reservation,root.path("usage").path("prompt_tokens").asInt(),root.path("usage").path("completion_tokens").asInt(),
                        response.headers().map().entrySet().stream().collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,e->e.getValue().getFirst())));
                call.put("rawOutput",raw);call.set("usage",root.path("usage"));call.put("finishReason",choice.path("finish_reason").asString());write();
                return new GroqChatResult(raw,root.path("model").asString(),choice.path("finish_reason").asString(),root.path("usage").path("prompt_tokens").asInt(),root.path("usage").path("completion_tokens").asInt(),(System.nanoTime()-started)/1000000);
            } catch(java.io.IOException | InterruptedException failure) {
                if(failure instanceof InterruptedException) Thread.currentThread().interrupt();
                call.put("state","TRANSPORT_FAILED");write();throw new IllegalStateException("DIAGNOSTIC_TRANSPORT_FAILED");
            }
        }
    }
    private JsonNode canonical(String prompt) {
        // Only the version label changed in OBSERVE; all remaining JSON values and chunk suffix must match.
        int end=prompt.lastIndexOf('}');
        ObjectNode root=(ObjectNode)mapper.readTree(prompt.substring(0,end+1));
        if(root.path("stage").asString().startsWith("OBSERVE:")) root.remove("promptVersion");
        root.put("diagnosticSuffix",prompt.substring(end+1));return root;
    }
    private void write() {
        try {Files.writeString(folder.resolve("report.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));}
        catch(java.io.IOException failure) {throw new IllegalStateException("DIAGNOSTIC_AUDIT_WRITE_FAILED");}
    }
    private String query(String sql) throws Exception {
        var process=new ProcessBuilder("docker","exec","oneuldo-postgres","psql","-U","oneuldo","-d","oneuldo","-Atc",sql).start();
        String raw=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        assertThat(process.waitFor()).isZero();return raw;
    }
}
