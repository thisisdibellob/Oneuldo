package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
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

/** Opt-in independent final reviews of three immutable plays, never a new play/profile/quest. */
class FinalReviewSourceReplayLiveTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private static final Path REPOSITORY = Path.of("/Users/bluem/Documents/GitHub/Oneuldo");
    private static final Path OUT = REPOSITORY.resolve("output/ai-quality-fixes-20261010/live-replay");
    private static final List<String> CASES = List.of("minsu-r2", "minjae-baseline", "minjae-r1");
    private final AnalysisTokenBudget budget = new AnalysisTokenBudget();

    private record Prepared(String name, Path target, BehaviorAnalysisInputResponse input,
            AnalysisReferences refs, String prompt, ObjectNode report) {}

    @Test
    @EnabledIfEnvironmentVariable(named = "AI_FINAL_SOURCE_REVIEW_PREFLIGHT_ONLY", matches = "true")
    void verify_three_immutable_sources_without_reading_a_key_or_calling_a_provider() throws Exception {
        ReflectionTestUtils.setField(budget, "requestTokens", 18000);
        ReflectionTestUtils.setField(budget, "finalOutputTokens", 2400);
        var summary = mapper.createObjectNode().put("executionKind", "SOURCE_REVIEW_PREFLIGHT_ONLY_NO_NETWORK")
                .put("actualModelCalls", 0).put("credentialsRead", false).put("actualExecutionApprovalBlocked", true);
        var cases = summary.putArray("cases");
        for (String name : CASES) {
            var item = prepare(name);
            cases.addObject().put("case", name).put("preflightStatus", item.report().path("preflightStatus").asString())
                    .put("requestTokensIncludingOutputAndBaseRetry", item.report().path("requestTokensIncludingOutputAndBaseRetry").asInt());
        }
        Files.writeString(OUT.resolve("final-review-v37-preflight-summary.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(summary) + "\n");
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "AI_FINAL_SOURCE_REVIEW_LIVE", matches = "true")
    void three_source_plays_receive_only_the_current_independent_final_review() throws Exception {
        ReflectionTestUtils.setField(budget, "requestTokens", 18000);
        ReflectionTestUtils.setField(budget, "finalOutputTokens", 2400);
        var prepared = new ArrayList<Prepared>();
        // Complete every source/hash/token check before any provider call.
        for (String name : CASES) prepared.add(prepare(name));
        var key = Files.readString(Path.of(System.getProperty("user.home"), ".local/share/oneuldo/school-gateway-client.key")).strip();
        var properties = new OllamaProperties("http://127.0.0.1:18083", "qwen3.6:27b-q4_K_M", 18432,
                Duration.ofMinutes(10), Duration.ofSeconds(10), 8, "10m", key);
        var http = new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(10));
        var realClient = new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(), properties);
        var outcomes = new ArrayList<Boolean>();
        for (var item : prepared) outcomes.add(runReview(item, realClient));
        var summary = mapper.createObjectNode();
        summary.put("executionKind", "ACTUAL_QWEN_INDEPENDENT_FINAL_REVIEW_ONLY");
        summary.put("analysisVersion", AiBehaviorAnalysisPromptFactory.VERSION).put("reviewVersion", AnalysisReviewPrompt.VERSION);
        summary.put("newPlays", 0).put("profileUpdates", 0).put("questGenerations", 0).put("extraAiReductionCalls", 0);
        summary.put("allOperatorTaskChecksPassed", outcomes.stream().allMatch(Boolean::booleanValue));
        var cases = summary.putArray("cases");
        for (var item : prepared) cases.addObject().put("case", item.name()).put("status", item.report().path("status").asString())
                .put("attemptCount", item.report().path("attempts").size()).put("operatorTaskCheckPassed", item.report().path("operatorTaskCheckPassed").asBoolean())
                .put("wallSecondsIncludingQueueAndRetries", item.report().path("wallSecondsIncludingQueueAndRetries").asDouble());
        Files.writeString(OUT.resolve("final-review-v37-summary.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(summary) + "\n");
        assertThat(outcomes).containsExactly(true, true, true);
    }

    private Prepared prepare(String name) throws Exception {
        Path directory = OUT.resolve(name), target = directory.resolve("final-review-v37.json");
        if (Files.exists(target)) {
            var existing = mapper.readTree(Files.readString(target));
            assertThat(existing.path("status").asString()).as("Do not overwrite a previous call: %s", target).isEqualTo("PREFLIGHT");
            assertThat(existing.path("providerResponses").isEmpty()).as("Unattempted preflight can be reused; actual calls cannot").isTrue();
            assertThat(existing.path("attempts").isEmpty()).isTrue();
        }
        var report = mapper.createObjectNode();
        report.put("case", name).put("executionKind", "PREPARED_INDEPENDENT_FINAL_REVIEW_NO_CALL")
                .put("plannedExecutionKind", "ACTUAL_QWEN_INDEPENDENT_FINAL_REVIEW_ONLY");
        report.put("newPlay", false).put("newProfile", false).put("newQuest", false).put("expectedAnswerProvidedToModel", false);
        report.put("analysisVersion", AiBehaviorAnalysisPromptFactory.VERSION).put("reviewVersion", AnalysisReviewPrompt.VERSION);
        report.put("outputTokensReserved", 2400).put("requestBudget", 18000).put("contextLength", 18432).put("temperature", 0.2);
        report.put("extraAiReductionCalls", 0).put("status", "PREFLIGHT");
        report.put("scope", "Existing immutable source play; final independent review only. No new observation/draft calls, learning, ability, profile or quest update.");
        try {
            var manifest = mapper.readTree(Files.readString(directory.resolve("source-manifest.json")));
            Path inputFile = directory.resolve("original-input.json");
            byte[] bytes = Files.readAllBytes(inputFile);
            String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            assertThat(hash).isEqualTo(manifest.path("originalInputSha256").asString());
            report.put("originalInputSha256", hash).put("originalInputShaVerified", true);
            var input = mapper.readValue(bytes, BehaviorAnalysisInputResponse.class);
            var refs = new AnalysisReferences(mapper, input);
            Path oldAuditFile = REPOSITORY.resolve("output/persona-hard-baseline-3-20261010")
                    .resolve(manifest.path("sourcePhase").asString()).resolve("analysis-audit.json");
            var oldAudit = mapper.readTree(Files.readString(oldAuditFile));
            var encoding = new FinalSourceEncoding(mapper);
            ObjectNode source = null; int sourceAttempt = 0;
            for (var attempt : oldAudit.path("attempts")) {
                if (attempt.path("outputMax").asInt() != 2400) continue;
                var decoded = encoding.decode(mapper.readTree(firstJson(attempt.path("inputPrompt").asString())));
                if (decoded.path("stage").asString().startsWith("FINAL:")) {
                    source = decoded; sourceAttempt = attempt.path("number").asInt(); break;
                }
            }
            assertThat(source).as("Saved FINAL source exists").isNotNull();
            report.put("savedFinalSourceAudit", REPOSITORY.relativize(oldAuditFile).toString()).put("savedFinalSourceAttempt", sourceAttempt);
            var taskBefore = source.path("taskContext").deepCopy();
            var movementBefore = source.path(MovementSourceContext.FIELD).deepCopy();
            var raw = mapper.createObjectNode();
            raw.set(SourceEventDetails.FIELD, SourceEventDetails.build(mapper, input));
            var aliased = new LosslessTables(mapper).decode(mapper.readTree(refs.encode(mapper.writeValueAsString(raw))));
            source.set(SourceEventDetails.FIELD, aliased.path(SourceEventDetails.FIELD).deepCopy());
            String encoded = mapper.writeValueAsString(encoding.encodeReadable(source));
            var rebuilt = encoding.decode(mapper.readTree(encoded));
            rebuilt.remove(ReadableSourceFacts.FIELD);
            assertThat(rebuilt).isEqualTo(source);
            assertThat(rebuilt.path(SourceEventDetails.FIELD)).isEqualTo(aliased.path(SourceEventDetails.FIELD));
            String prompt = AnalysisReviewPrompt.build(mapper, encoded, null, refs);
            var reviewedSource = encoding.decode(mapper.readTree(prompt));
            assertThat(reviewedSource.path(SourceEventDetails.FIELD)).isEqualTo(aliased.path(SourceEventDetails.FIELD));
            assertThat(reviewedSource.path("taskContext")).isEqualTo(taskBefore);
            assertThat(reviewedSource.path(MovementSourceContext.FIELD)).isEqualTo(movementBefore);
            assertThat(reviewedSource.has("draftToReview")).isFalse();
            assertThat(prompt).doesNotContain("expectedTaskOutcomeFromSavedMeasurement", "oldModelJudgment", "savedMeasurementFacts");
            // Current independent review source intentionally does not repeat raw-backed old AI observations.
            report.put("sourceRoundTripVerified", true).put("rebuiltRawEventsVerified", true)
                    .put("originalTaskContextVerified", true).put("originalMovementContextVerified", true);
            report.put("originalEventCount", input.eventCount()).put("rebuiltSourceEventCount", aliased.path(SourceEventDetails.FIELD).size());
            report.put("systemPrompt", AnalysisReviewPrompt.system()).put("inputPrompt", prompt);
            report.put("inputTokensWithMessageFraming", QwenTokenCounter.inputTokens(AnalysisReviewPrompt.system(), prompt));
            report.put("requestTokensIncludingOutput", budget.total(AnalysisReviewPrompt.system(), prompt, 2400));
            String retry = (String)ReflectionTestUtils.getField(TimelineAnalysisPipeline.class, "RETRY");
            report.put("requestTokensIncludingOutputAndBaseRetry", budget.total(AnalysisReviewPrompt.system(), prompt + retry, 2400));
            budget.requireFits(AnalysisReviewPrompt.system(), prompt + retry, 2400, 18000, "REVIEW_INPUT_TOO_LARGE");
            report.put("preflightStatus", "PASSED");
            save(target, report);
            System.out.println("LIVE_REVIEW_PREFLIGHT " + name + " requestTokens=" + report.path("requestTokensIncludingOutputAndBaseRetry").asInt());
            return new Prepared(name, target, input, refs, prompt, report);
        } catch (Exception | AssertionError failure) {
            report.put("status", "FAILED").put("preflightStatus", "FAILED").put("error", boundedReason(failure));
            save(target, report);
            throw failure;
        }
    }

    private boolean runReview(Prepared item, RestOllamaChatClient realClient) throws Exception {
        var report = item.report();
        var audit = new ArrayList<AiBehaviorAnalysisRun.Attempt>();
        var responses = report.putArray("providerResponses");
        var validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
        GroqChatClient recordingClient = new GroqChatClient() {
            @Override public GroqChatResult complete(String system, String user) { return complete(system, user, 2400, 0.2); }
            @Override public GroqChatResult complete(String system, String user, int output, double temperature) {
                report.put("status", "RUNNING").put("executionKind", "ACTUAL_QWEN_INDEPENDENT_FINAL_REVIEW_ONLY")
                        .put("activeProviderRequestStartedAt", Instant.now().toString());
                report.put("activeRequestTokensIncludingOutput", budget.total(system, user, output));
                saveUnchecked(item.target(), report);
                var response = realClient.complete(system, user, output, temperature);
                var row = responses.addObject().put("sequence", responses.size() + 1).put("actualInputPrompt", user);
                row.set("response", mapper.valueToTree(response));
                row.put("latencyScope", "HTTP elapsed includes provider queue/network/inference; pure GPU inference time is not separately available.");
                saveUnchecked(item.target(), report);
                return response;
            }
        };
        var pipeline = new TimelineAnalysisPipeline(new AiBehaviorAnalysisPromptFactory(mapper), validator, recordingClient, mapper,
                64, budget, new AnalysisCallPacer());
        Function<String, AiBehaviorAnalysis> parse = raw -> validator.validate(
                item.refs().read(AnalysisReviewPrompt.reviewedAnalysis(mapper, raw, item.refs())), item.input());
        long started = System.nanoTime();
        try {
            System.out.println("LIVE_REVIEW_START " + item.name());
            AiBehaviorAnalysis analysis = ReflectionTestUtils.invokeMethod(pipeline, "call", AnalysisReviewPrompt.system(),
                    item.prompt(), 2400, 18000, audit, parse);
            assertThat(analysis).isNotNull();
            report.set("analysis", mapper.valueToTree(analysis));
            report.put("status", "READY").put("sourceEvidenceValidationPassed", true);
            // Load operator expectations only after the model has completed and been source-validated.
            var expected = mapper.readTree(Files.readString(item.target().getParent().resolve("expected-review.json")));
            String expectedJudgment = expected.path("expectedTaskOutcomeFromSavedMeasurement").asString();
            boolean matches = analysis.sessionAssessments().size() == 1
                    && expectedJudgment.equals(analysis.sessionAssessments().getFirst().judgment());
            report.put("operatorExpectedTaskOutcome", expectedJudgment).put("operatorTaskCheckPassed", matches);
            report.put("operatorCheckScope", "Recorded task-contract outcome comparison after response; not a learner ability/learning judgment and never sent to model.");
            System.out.println("LIVE_REVIEW_DONE " + item.name() + " judgment=" + analysis.sessionAssessments().getFirst().judgment()
                    + " attempts=" + audit.size() + " operatorMatch=" + matches);
            return matches;
        } catch (Exception | AssertionError failure) {
            report.put("status", "FAILED").put("error", boundedReason(failure)).put("operatorTaskCheckPassed", false);
            System.out.println("LIVE_REVIEW_FAILED " + item.name() + " type=" + failure.getClass().getSimpleName() + " attempts=" + audit.size());
            return false;
        } finally {
            report.set("attempts", mapper.valueToTree(audit));
            report.put("actualProviderResponses", responses.size()).put("wallSecondsIncludingQueueAndRetries", (System.nanoTime() - started) / 1e9);
            report.put("completedAt", Instant.now().toString());
            save(item.target(), report);
        }
    }

    private String boundedReason(Throwable failure) {
        String reason = failure.getMessage();
        return reason == null ? failure.getClass().getSimpleName() : reason.substring(0, Math.min(500, reason.length()));
    }
    private void saveUnchecked(Path target, ObjectNode report) {
        try { save(target, report); } catch (Exception failure) { throw new IllegalStateException("LIVE_REVIEW_RECORD_SAVE_FAILED", failure); }
    }
    private void save(Path target, ObjectNode report) throws Exception {
        Files.writeString(target, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report) + "\n");
    }
    private static String firstJson(String input) {
        int depth = 0; boolean quoted = false, escaped = false;
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (quoted) {
                if (escaped) escaped = false; else if (c == '\\') escaped = true; else if (c == '"') quoted = false;
            } else if (c == '"') quoted = true;
            else if (c == '{' || c == '[') depth++;
            else if ((c == '}' || c == ']') && --depth == 0) return input.substring(0, i + 1);
        }
        throw new IllegalArgumentException("SAVED_PROMPT_FIRST_JSON_MISSING");
    }
}
