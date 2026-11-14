package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Offline costing of immutable saved sources; this never calls a model or removes a raw event. */
class ReadableSourceBudgetReplayTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private static final Path REPOSITORY = Path.of("/Users/bluem/Documents/GitHub/Oneuldo");
    private static final Path OUTPUT = REPOSITORY.resolve("output/ai-quality-fixes-20261010/budget-tests");
    private static final int OUTPUT_TOKENS = 2400, CONTEXT = 18432, REQUEST_BUDGET = 18000;

    @Test void count_current_literal_lens_and_review_for_two_saved_large_sources_without_a_provider() throws Exception {
        var encoding = new FinalSourceEncoding(mapper);
        String retry = (String)ReflectionTestUtils.getField(TimelineAnalysisPipeline.class, "RETRY");
        Path timerAuditFile = REPOSITORY.resolve("output/ai-quality-fixes-20261010/live-replay/timer/analysis-run.json");
        String timerFeedback = null, currentAlternativeFeedback = null;
        if (Files.exists(timerAuditFile)) {
            var timerAudit = mapper.readTree(Files.readString(timerAuditFile));
            var attempt = timerAudit.path("attempts").get(2);
            if (attempt != null && "INVALID_REVIEW_CLAIM_ARRAY".equals(attempt.path("validationFailure").path("code").asString())) {
                String submitted = attempt.path("inputPrompt").asString();
                timerFeedback = submitted.substring(firstJson(submitted).length());
                currentAlternativeFeedback = currentAlternativeFeedback();
            }
        }
        var measurements = new ArrayList<Map<String, Object>>();
        for (String relative : List.of("output/persona-hard-baseline-3-20261010/group-01/round-01/analysis-audit.json",
                "output/persona-hard-baseline-3-20261010/group-03/round-02/analysis-audit.json")) {
            var audit = mapper.readTree(Files.readString(REPOSITORY.resolve(relative)));
            JsonNode draftAttempt = null; JsonNode reviewRetry = null;
            for (var attempt : audit.path("attempts")) {
                if (attempt.path("outputMax").asInt() != OUTPUT_TOKENS) continue;
                var source = encoding.decode(mapper.readTree(firstJson(attempt.path("inputPrompt").asString())));
                if (source.path("stage").asString().startsWith("FINAL:") && draftAttempt == null) draftAttempt = attempt;
                if (source.path("stage").asString().startsWith("REVIEW:")
                        && attempt.path("inputPrompt").asString().length() > firstJson(attempt.path("inputPrompt").asString()).length()) reviewRetry = attempt;
            }
            assertThat(draftAttempt).isNotNull();
            String original = firstJson(draftAttempt.path("inputPrompt").asString());
            var decoded = encoding.decode(mapper.readTree(original));
            assertThat(decoded.has(ReadableSourceFacts.FIELD)).isFalse();
            var readable = encoding.encodeReadable(decoded);
            String source = mapper.writeValueAsString(readable);
            var roundTrip = encoding.decode(readable);
            var lens = roundTrip.remove(ReadableSourceFacts.FIELD);
            assertThat(roundTrip).isEqualTo(decoded);
            assertThat(lens).isEqualTo(ReadableSourceFacts.build(mapper, decoded));
            String group = relative.contains("group-01") ? "01" : "03";
            var snapshotFile = REPOSITORY.resolve("output/persona-hard-baseline-3-20261010/final-budget-triage/group-" + group + "-frozen-snapshot.json");
            var archivedInput = mapper.readValue(Files.readString(snapshotFile), oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse.class);
            var references = new AnalysisReferences(mapper, archivedInput);
            String currentReview = AnalysisReviewPrompt.build(mapper, source, null, references);
            var decodedReview = encoding.decode(mapper.readTree(currentReview));
            assertThat(decodedReview.path(SourceEventDetails.FIELD)).isEqualTo(decoded.path(SourceEventDetails.FIELD));
            assertThat(decodedReview.path("taskContext")).isEqualTo(decoded.path("taskContext"));
            String criticalSku = relative.contains("group-01") ? "milk" : "carrot";
            boolean terminalValuePreserved = false;
            for (var snapshot : lens.path("terminalSnapshots"))
                for (var item : snapshot.path("recordedCart"))
                    if (criticalSku.equals(item.path("productId").asString()) && item.path("quantity").asInt() == 2) terminalValuePreserved = true;
            assertThat(terminalValuePreserved).as("saved terminal SKU %s quantity2", criticalSku).isTrue();
            var row = new LinkedHashMap<String, Object>();
            row.put("auditFile", relative);
            row.put("sourceAttempt", draftAttempt.path("number").asInt());
            row.put("savedPromptVersion", audit.path("prompt_version").asString());
            row.put("savedSourceEncodingVersion", mapper.readTree(original).path("finalSourceEncodingVersion").asString());
            row.put("currentReviewVersion", AnalysisReviewPrompt.VERSION);
            row.put("currentFinalInputVersion", FinalAnalysisPromptCompactor.VERSION);
            row.put("sourceEventCount", decoded.path(SourceEventDetails.FIELD).size());
            row.put("literalActionRowCount", lens.path("eventsById").size());
            row.put("terminalSnapshotCount", lens.path("terminalSnapshots").size());
            row.put("originalSourceRoundTripPreserved", true);
            row.put("reviewRawEventsPreserved", true);
            row.put("reviewTasksPreserved", true);
            row.put("criticalSku", criticalSku);
            row.put("criticalRecordedQuantity", 2);
            row.put("criticalTerminalValuePreserved", terminalValuePreserved);
            String sameSourceWithoutLens = mapper.writeValueAsString(encoding.encode(decoded));
            row.put("literalLensTokensAlone", QwenTokenCounter.count(mapper.writeValueAsString(lens)));
            row.put("actualFinalSourceLensTokenIncrease", QwenTokenCounter.count(source) - QwenTokenCounter.count(sameSourceWithoutLens));
            row.put("savedDraft", cost(draftAttempt.path("systemPrompt").asString(), original, "", 0));
            row.put("currentDraft", cost(FinalAnalysisPromptCompactor.systemPrompt(), source, "", 0));
            row.put("currentDraftWithRetryReserve", cost(FinalAnalysisPromptCompactor.systemPrompt(), source, retry, 0));
            row.put("currentReview", cost(AnalysisReviewPrompt.system(), currentReview, "", 0));
            row.put("currentReviewWithRetryAndEstimateMargin", cost(AnalysisReviewPrompt.system(), currentReview, retry, 256));
            if (reviewRetry != null) {
                String full = reviewRetry.path("inputPrompt").asString();
                String suffix = full.substring(firstJson(full).length());
                row.put("savedReviewRetrySuffixCharacters", suffix.length());
                row.put("currentReviewWithSavedRetrySuffix", cost(AnalysisReviewPrompt.system(), currentReview, suffix, 0));
                row.put("currentReviewWithSavedRetrySuffixAndEstimateMargin", cost(AnalysisReviewPrompt.system(), currentReview, suffix, 256));
            }
            if (timerFeedback != null) {
                row.put("timerRetrySource", REPOSITORY.relativize(timerAuditFile).toString());
                row.put("timerRetryAttempt", 3);
                row.put("savedTimerAlternativeFeedbackCharacters", timerFeedback.length());
                row.put("currentExtraAlternativeFeedbackCharacters", currentAlternativeFeedback.length());
                row.put("currentExtraAlternativeFeedbackSource", "backend/src/main/java/oneuldo/behaviorlog/analysis/service/TimelineAnalysisPipeline.java");
                row.put("combinedAlternativeFeedbackCharacters", timerFeedback.length() + currentAlternativeFeedback.length());
                row.put("currentReviewWithTimerAlternativeFeedbackAndCurrentExtra", cost(AnalysisReviewPrompt.system(), currentReview, timerFeedback + currentAlternativeFeedback, 0));
                row.put("currentReviewWithTimerAlternativeFeedbackCurrentExtraAndEstimateMargin", cost(AnalysisReviewPrompt.system(), currentReview, timerFeedback + currentAlternativeFeedback, 256));
            }
            measurements.add(row);
        }
        Files.createDirectories(OUTPUT);
        var result = new LinkedHashMap<String, Object>();
        result.put("measurementScope", "Current system prompts + encodeReadable applied to unchanged decoded old final sources + current independent review. Original station references use the preserved same-group frozen snapshot; current dataset-source rebuild is not measured.");
        result.put("tokenizer", "pinned Qwen3.6-27b native BPE");
        result.put("tokenizerSha256", "5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42");
        result.put("contextLimit", CONTEXT); result.put("requestBudget", REQUEST_BUDGET); result.put("reservedOutput", OUTPUT_TOKENS);
        result.put("providerFramingAllowance", 64); result.put("independentReviewEstimateMargin", 256);
        result.put("liveProviderCalls", 0); result.put("sourceEventsOmitted", 0); result.put("contextExpanded", false);
        result.put("currentFinalInputVersion", FinalAnalysisPromptCompactor.VERSION);
        result.put("currentReviewVersion", AnalysisReviewPrompt.VERSION);
        result.put("fitScope", "Only these immutable saved final sources and measured suffixes; newly assembled observation content can exceed the budget and require further lossless reduction.");
        result.put("measurements", measurements);
        Files.writeString(OUTPUT.resolve("saved-source-current-lens-budget.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(result) + "\n");
    }

    /** Read the current literal-only runtime branch rather than inventing or shortening retry feedback. */
    private String currentAlternativeFeedback() throws Exception {
        String runtimeSource = Files.readString(REPOSITORY.resolve("backend/src/main/java/oneuldo/behaviorlog/analysis/service/TimelineAnalysisPipeline.java"));
        int start = runtimeSource.indexOf("correction += \"\\nalternativeExplanations");
        assertThat(start).isGreaterThanOrEqualTo(0);
        String expression = runtimeSource.substring(start, runtimeSource.indexOf(';', start));
        var literals = java.util.regex.Pattern.compile("\"(?:\\\\.|[^\"\\\\])*\"").matcher(expression);
        var text = new StringBuilder();
        while (literals.find()) text.append(mapper.<String>readValue(literals.group(), String.class));
        assertThat(text.toString()).contains("alternativeExplanations", "uncertainties", "[]");
        return text.toString();
    }

    private Map<String, Object> cost(String system, String source, String suffix, int estimateMargin) {
        int systemTokens = QwenTokenCounter.count(system), sourceTokens = QwenTokenCounter.count(source + suffix);
        int total = systemTokens + sourceTokens + 64 + OUTPUT_TOKENS;
        return Map.of("systemTokens", systemTokens, "sourceAndSuffixTokens", sourceTokens,
                "requestTotal", total, "requestWithEstimateMargin", total + estimateMargin,
                "requestBudgetExceededBy", Math.max(0, total + estimateMargin - REQUEST_BUDGET),
                "contextExceededBy", Math.max(0, total - CONTEXT),
                "requestBudgetRemaining", REQUEST_BUDGET - total - estimateMargin,
                "contextRemaining", CONTEXT - total);
    }

    /** Saved retries append prose after one JSON object. Keep that suffix separate from source decoding. */
    private static String firstJson(String input) {
        int depth = 0; boolean quoted = false, escaped = false;
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (quoted) {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') quoted = false;
            } else if (c == '"') quoted = true;
            else if (c == '{' || c == '[') depth++;
            else if ((c == '}' || c == ']') && --depth == 0) return input.substring(0, i + 1);
        }
        throw new IllegalArgumentException("SAVED_PROMPT_FIRST_JSON_MISSING");
    }
}
