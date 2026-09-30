package oneuldo.behaviorlog.profile.service;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in targeted live regression. Saved full-session evidence/digests; fresh final reviews and profiles.
 * No gameplay, checkpoint or database writes. This is not a fresh observation-to-quest pipeline run.
 */
@EnabledIfEnvironmentVariable(named="AI_THREE_ROUND_QUALITY_LIVE",matches="true")
class ThreeRoundQualityLiveTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final Path fixtures=Path.of("../output/quality-validation-20260929");
    final Path root=fixtures.resolve(System.getenv().getOrDefault("AI_QUALITY_RUN","compatible-1800"));
    final Path prior=Path.of("../output/closed-loop-pilot-20260929");
    @Test void revalidates_saved_inline_citations_without_another_model_call() throws Exception {
        Files.createDirectories(root);
        var recorded=mapper.readTree(Files.readString(fixtures.resolve("comparison-source-1800/round-3-review-1.json")));
        assertThat(recorded.path("error").asString()).isEqualTo("INLINE_REVIEW_REFERENCE_NOT_ALLOWED");
        var input=mapper.readValue(Files.readString(fixtures.resolve("round-3-input.json")),BehaviorAnalysisInputResponse.class);
        var refs=new AnalysisReferences(mapper,input);
        var normalized=AnalysisReviewPrompt.reviewedAnalysis(mapper,recorded.path("response").path("text").asString(),refs);
        var result=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(refs.read(normalized),input);
        var report=mapper.createObjectNode();report.put("stage","saved-response-revalidation");
        report.put("modelCalls",0);report.put("databaseWrites",false);report.put("status","READY");
        report.put("originalError",recorded.path("error").asString());report.set("analysis",mapper.valueToTree(result));
        Files.writeString(root.resolve("round-3-inline-revalidated.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report),StandardOpenOption.CREATE_NEW);
        assertThat(result.sessionAssessments().getFirst().judgment()).isEqualTo("SUCCESS");
    }
    @Test void rechecks_recorded_wrong_and_correct_purchases_and_the_failed_profile() throws Exception {
        Files.createDirectories(root);
        int outputTokens=Integer.parseInt(System.getenv().getOrDefault("AI_QUALITY_OUTPUT_TOKENS","1800"));
        assertThat(outputTokens).isIn(1800,2400);
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        String url="http://127.0.0.1:18083";
        var properties=new OllamaProperties(url,"qwen3.6:27b-q4_K_M",18432,Duration.ofMinutes(15),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(15));
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(url).requestFactory(http).build(),properties);
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",18000);
        ReflectionTestUtils.setField(budget,"finalOutputTokens",outputTokens);
        var validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        List<String> failures=new ArrayList<>();
        String stage=System.getenv().getOrDefault("AI_QUALITY_STAGE","all");
        assertThat(stage).isIn("all","reviews","profiles","correction");
        boolean retryRoundTwo=Boolean.parseBoolean(System.getenv().getOrDefault("AI_QUALITY_RETRY_ROUND_2","false"));
        for(int n:(stage.equals("profiles") || stage.equals("correction")) ? List.<Integer>of() : retryRoundTwo ? List.of(2) : List.of(1,1,2,3)) {
            String name="round-"+n+"-review-"+(Files.exists(root.resolve("round-"+n+"-review-1.json"))?2:1);
            Path target=root.resolve(name+".json");assertThat(Files.exists(target)).isFalse();
            var input=mapper.readValue(Files.readString(fixtures.resolve("round-"+n+"-input.json")),BehaviorAnalysisInputResponse.class);
            var old=mapper.treeToValue(mapper.readTree(Files.readString(prior.resolve("ai-recommended-"+n+"-analysis.json"))).path("response"),AiBehaviorAnalysisResponse.class);
            var refs=new AnalysisReferences(mapper,input);
            String prompt=AnalysisReviewPrompt.build(mapper,Files.readString(fixtures.resolve("round-"+n+"-review-source.json")),old.analysis(),refs);
            if(retryRoundTwo) {
                var rejected=mapper.readTree(Files.readString(fixtures.resolve("comparison-source-2400/round-2-review-1.json")));
                try {
                    AnalysisReviewPrompt.reviewedAnalysis(mapper,rejected.path("response").path("text").asString(),refs);
                    throw new AssertionError("Expected the recorded validation failure");
                } catch(ReviewEvidenceException failure) {
                    prompt += "\n문장별 근거 오류: " + mapper.writeValueAsString(failure.details())
                        + ". 해당 경로의 문장 객체를 원본과 대조하고 text와 evidenceEventIds를 함께 수정하세요. "
                        + "REVIEW_EVIDENCE_OUT_OF_ORDER는 앞선 사건으로 돌아간 오류이므로 관찰 절과 근거 순서를 바로잡으세요. "
                        + "무관한 사건을 추가하지 말고 수정된 전체 JSON을 반환하세요.";
                }
            }
            budget.requireFits(AnalysisReviewPrompt.system(),prompt,outputTokens,18000,"REVIEW_INPUT_TOO_LARGE");
            var report=mapper.createObjectNode();report.put("stage",retryRoundTwo ? "targeted-review-retry" : "final-review-only");report.put("databaseWrites",false);
            report.put("outputMax",outputTokens);report.put("reviewVersion",AnalysisReviewPrompt.VERSION);report.put("inputPrompt",prompt);report.put("status","RUNNING");
            Files.writeString(target,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report),StandardOpenOption.CREATE_NEW);
            long start=System.nanoTime();
            try {
                var response=client.complete(AnalysisReviewPrompt.system(),prompt,outputTokens,0.2);report.set("response",mapper.valueToTree(response));
                if("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                var result=validator.validate(refs.read(AnalysisReviewPrompt.reviewedAnalysis(mapper,response.text(),refs)),input);
                report.set("analysis",mapper.valueToTree(result));report.put("status","READY");
                String expected=n==1?"FAILURE":"SUCCESS";
                boolean matched=result.sessionAssessments().getFirst().judgment().equals(expected);
                report.put("expectedTaskJudgment",expected);report.put("taskJudgmentMatched",matched);
                if(!matched) failures.add(name+": judgment mismatch");
            } catch(RuntimeException e) {report.put("status","FAILED");report.put("error",e.getMessage());failures.add(name+": "+e.getMessage());}
            report.put("wallSeconds",(System.nanoTime()-start)/1e9);
            Files.writeString(target,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
            System.out.println(name+" "+report.path("status").asString()+" matched="+report.path("taskJudgmentMatched").asBoolean());
        }
        if(stage.equals("reviews")) { assertThat(failures).isEmpty(); return; }
        // Repeat the failed profile request with unchanged source analyses and a mocked repository.
        var old=mapper.readTree(Files.readString(prior.resolve(stage.equals("correction") ? "ai-recommended-1.profile.json" : "ai-recommended-2.profile.json")));
        var current=mapper.treeToValue(mapper.readTree(Files.readString(prior.resolve(stage.equals("correction") ? "ai-recommended-1-analysis.json" : "ai-recommended-3-analysis.json"))).path("response"),AiBehaviorAnalysisResponse.class);
        if(stage.equals("correction")) {
            var recorded=mapper.readTree(Files.readString(fixtures.resolve("comparison-source-1800/round-1-review-1.json")));
            assertThat(recorded.path("status").asString()).isEqualTo("READY");
            assertThat(recorded.path("taskJudgmentMatched").asBoolean()).isTrue();
            current=new AiBehaviorAnalysisResponse(UUID.randomUUID(),current.datasetId(),"READY",current.model(),
                    AnalysisReviewPrompt.VERSION,current.evidenceVersion(),current.eventCount(),0,Instant.now(),null,
                    mapper.treeToValue(recorded.path("analysis"),AiBehaviorAnalysis.class));
        }
        UUID session=current.analysis().sessionAssessments().getFirst().sessionId();
        for(int run=1;run<=2;run++) {
            UUID member=UUID.randomUUID();
            var previous=new AiUserProfile(member,3,null,UUID.fromString(old.path("sourceAnalysisId").asString()),UUID.randomUUID(),
                    UUID.fromString(old.path("sourceSessionId").asString()),"READY","old","model","","",List.of(),
                    mapper.treeToValue(old.path("profile"),AiBehaviorAnalysis.class),null,0);
            var repo=mock(AiUserProfileRepository.class);
            when(repo.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(member,"READY")).thenReturn(Optional.of(previous));
            Path target=root.resolve((stage.equals("correction") ? "profile-correction-" : "profile-recovery-")+run+".json");assertThat(Files.exists(target)).isFalse();
            when(repo.save(any())).thenAnswer(i->{
                AiUserProfile saved=i.getArgument(0);var report=mapper.createObjectNode();
                report.put("databaseWrites",false);report.put("stage",stage.equals("correction") ? "same-session-profile-correction" : "profile-only");report.put("status",saved.getStatus());
                report.put("promptVersion",saved.getPromptVersion());report.put("latencyMs",saved.getLatencyMs());
                report.put("inputPrompt",saved.getInputPrompt());report.set("attempts",mapper.valueToTree(saved.getAttempts()));
                report.set("profile",mapper.valueToTree(saved.getProfile()));
                Files.writeString(target,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report),StandardOpenOption.CREATE_NEW);return saved;
            });
            var service=new AiUserProfileService(repo,new AiUserProfilePromptFactory(mapper),new AiUserProfileValidator(new MarketAiDifficultyValidator()),client,mapper,budget, org.mockito.Mockito.mock(oneuldo.behaviorlog.personalization.service.PracticeHistoryService.class));
            var result=service.updateFromSession(member,session,current);
            System.out.println("profile-recovery-"+run+" "+result.status());
            if(!"READY".equals(result.status())) failures.add("profile-recovery-"+run+": "+result.errorCode());
        }
        assertThat(failures).isEmpty();
    }
}
