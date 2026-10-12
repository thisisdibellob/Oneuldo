package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.function.Function;
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
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Real independent semantic review of saved real candidates; only rejected candidates receive new model-authored repairs. */
@EnabledIfEnvironmentVariable(named="AI_PLAN_SOURCE_REVIEW_LIVE", matches="true")
class PlanSourceReviewLiveTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final Path source = Path.of(System.getProperty("oneuldo.analysis-smoke.output"));
    private final Path out = Path.of(System.getProperty("oneuldo.plan-source.output", source.getParent().resolve("analysis-gated").toString()));
    private void save(Path path, ObjectNode value) {
        try { Files.writeString(path, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n"); }
        catch (Exception error) { throw new IllegalStateException("PLAN_SOURCE_AUDIT_SAVE_FAILED", error); }
    }
    @Test void saved_candidates_and_live_repairs_require_current_independent_plan_source_review() throws Exception {
        var key = Files.readString(Path.of(System.getProperty("user.home"), ".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties = new OllamaProperties("http://127.0.0.1:18083", "qwen3.6:27b-q4_K_M", 18432, Duration.ofMinutes(10), Duration.ofSeconds(10), 8, "10m", key);
        var http = new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()); http.setReadTimeout(Duration.ofMinutes(10));
        var real = new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(), properties);
        var matches = new ArrayList<Boolean>();
        for (String name : List.of(System.getProperty("oneuldo.plan-source.cases", "corrected-selection,wrong-specification,help-movement-timeout,wrong-specification-flow,wrong-specification-exit,corrected-selection-flow,help-movement-recorded-door-timeout").split(","))) {
            Path dir = out.resolve(name); Files.createDirectories(dir); Path target = dir.resolve("result.json"); assertThat(Files.exists(target)).isFalse();
            Files.copy(source.resolve(name).resolve("input.json"), dir.resolve("input.json"));
            var saved = mapper.readTree(Files.readString(source.resolve(name).resolve("result.json"))); assertThat(saved.path("status").asString()).isEqualTo("READY");
            var providerResponses = saved.path("providerResponses");
            String raw = providerResponses.get(providerResponses.size()-1).path("response").path("text").asString();
            var input = mapper.readValue(Files.readString(dir.resolve("input.json")), BehaviorAnalysisInputResponse.class);
            var refs = new AnalysisReferences(mapper, input); var factory = new AiBehaviorAnalysisPromptFactory(mapper);
            String prompt = AnalysisReviewPrompt.build(mapper, AnalysisSynthesisPrompt.build(mapper, factory, input, List.of(), refs, false), null, refs);
            var report = mapper.createObjectNode().put("case", name).put("status", "RUNNING").put("newGamePlays", 0).put("profileUpdates", 0)
                    .put("sourceCandidateRecord", source.resolve(name).resolve("result.json").toString()).put("sourceCandidateReplayedAsNewProviderCall", false)
                    .put("analysisVersion", AiBehaviorAnalysisPromptFactory.VERSION).put("planSourceReviewVersion", AnalysisPlanSemanticReview.VERSION).put("startedAt", Instant.now().toString());
            report.put("sourceCandidateRaw", raw); report.put("inputPrompt", prompt);
            var responses = report.putArray("providerResponses"); var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
            GroqChatClient recording = new GroqChatClient() {
                @Override public GroqChatResult complete(String s, String u) { return complete(s, u, 2400, .2); }
                @Override public GroqChatResult complete(String s, String u, int max, double temperature) {
                    save(target, report); var response = real.complete(s, u, max, temperature);
                    responses.addObject().put("systemPrompt", s).put("inputPrompt", u).put("outputMax", max).put("actualProviderCall", true).set("response", mapper.valueToTree(response));
                    save(target, report); return response;
                }
            };
            var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
            var pipeline = new TimelineAnalysisPipeline(factory, validator, recording, mapper).withQualityReview(true).withPlanSemanticReview(true);
            Function<String, AiBehaviorAnalysis> parse = value -> validator.validate(refs.read(AnalysisReviewPrompt.reviewedCurrentAnalysis(mapper, value, refs)), input);
            long start = System.nanoTime(); boolean matched = false;
            try {
                AiBehaviorAnalysis analysis;
                try {
                    analysis = parse.apply(raw);
                    String diagnostics = System.getProperty("oneuldo.plan-source.saved-diagnostics", "");
                    if (!diagnostics.isEmpty()) {
                        var originalReview = mapper.readTree(Files.readString(Path.of(diagnostics).resolve(name).resolve("result.json"))).path("providerResponses").get(0).path("response").path("text").asString();
                        report.put("savedNegativeDiagnosticRecord", diagnostics + "/" + name + "/result.json");
                        // Transport-shape repairs never turn a partial old review into an approval.
                        // Its source-bound negative diagnostics can trigger a fresh model repair and full current approval.
                        AnalysisPlanSemanticReview.validate(mapper, originalReview, raw);
                    } else ReflectionTestUtils.invokeMethod(pipeline, "reviewPlanSource", prompt, raw, 18000, audit);
                    report.put("initialCandidateSemanticReview", "VALID");
                } catch (AnalysisPlanSemanticReview.Rejected rejected) {
                    report.put("initialCandidateSemanticReview", "REPAIR").set("initialRejection", mapper.readTree(rejected.review()));
                    var repair = new FinalSourceEncoding(mapper).decode(mapper.readTree(prompt));
                    repair.set("planSourceReviewFeedback", mapper.readTree(rejected.review()));
                    repair.put("planSourceRepairInstruction", "독립 검토에서 지적한 지원/원본 일치 오류를 원본에 따라 수정한다. 성패나 목표를 통과용으로 바꾸지 않는다. 현재 지원만 제안하고 종류/원인이 미기록이면 미확인으로 보존한다.");
                    String repairPrompt = mapper.writeValueAsString(new FinalSourceEncoding(mapper).encodeReadable(repair));
                    analysis = ReflectionTestUtils.invokeMethod(pipeline, "call", AnalysisReviewPrompt.system(), repairPrompt, 2400, 18000, audit, parse, false, 3);
                }
                report.put("status", "READY").set("analysis", mapper.valueToTree(analysis));
                String expected = name.startsWith("corrected-selection") ? "SUCCESS" : "FAILURE";
                matched = expected.equals(analysis.sessionAssessments().getFirst().judgment());
                report.put("operatorExpectedJudgment", expected).put("operatorTaskJudgmentMatched", matched);
            } catch (RuntimeException failure) { report.put("status", "FAILED").put("error", failure.getMessage()==null ? failure.getClass().getSimpleName() : failure.getMessage()); }
            finally { report.put("wallSeconds", (System.nanoTime()-start)/1e9).put("completedAt", Instant.now().toString()); report.set("attempts", mapper.valueToTree(audit)); save(target, report); }
            matches.add(matched);
        }
        var summary = mapper.createObjectNode().put("newGamePlays", 0).put("caseCount", matches.size()).put("allTaskJudgmentsMatched", matches.stream().allMatch(Boolean::booleanValue));
        save(out.resolve("summary.json"), summary); assertThat(matches).allMatch(Boolean::booleanValue);
    }
}
