package oneuldo.behaviorlog.analysis;

import java.util.List;
import oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import oneuldo.behaviorlog.analysis.service.ReviewClaimTextPatch;
import oneuldo.behaviorlog.analysis.service.ReviewEvidenceException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ReviewClaimTextPatchBudgetTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final ReviewEvidenceException.Details failure = new ReviewEvidenceException.Details(
            "INLINE_REVIEW_REFERENCE_NOT_ALLOWED", "/summary/0", List.of("E1"));

    @Test void budget_covers_every_literal_text_patch_and_does_not_mutate_the_candidate() {
        var candidate = candidate("규격 900mL 2개와 \"문자열\"\\경로를 확인했습니다(E1-E3).\n추정은 불확실합니다.");
        var analysis = (ObjectNode)candidate.path("analysis");
        var finding = analysis.putArray("findings").addObject();
        finding.putArray("observation").addObject().put("text", "목록을 다시 봤습니다[E1, E4 등].").putArray("evidenceEventIds").add("E1");
        finding.putArray("interpretation").addObject().put("text", "원인 확인은 어렵습니다（E4）.").putArray("evidenceEventIds").add("E4");
        finding.putArray("alternativeExplanations").addObject().put("text", "기기 지연도 가능합니다(E4~E6).").putArray("evidenceEventIds").add("E4");
        var assessment = analysis.putArray("sessionAssessments").addObject().put("judgment", "UNDETERMINED");
        assessment.putArray("explanation").addObject().put("text", "관측 범위는 제한적입니다(E6).").putArray("evidenceEventIds").add("E6");
        var expected = mapper.createObjectNode();
        var patches = expected.putArray("patches");
        patches.addObject().put("path", "/analysis/summary/0/text").put("value", "규격 900mL 2개와 \"문자열\"\\경로를 확인했습니다.\n추정은 불확실합니다.");
        patches.addObject().put("path", "/analysis/findings/0/observation/0/text").put("value", "목록을 다시 봤습니다.");
        patches.addObject().put("path", "/analysis/findings/0/interpretation/0/text").put("value", "원인 확인은 어렵습니다.");
        patches.addObject().put("path", "/analysis/findings/0/alternativeExplanations/0/text").put("value", "기기 지연도 가능합니다.");
        patches.addObject().put("path", "/analysis/sessionAssessments/0/explanation/0/text").put("value", "관측 범위는 제한적입니다.");
        String original = candidate.toString();
        int output = ReviewClaimTextPatch.outputTokens(mapper, original);
        assertThat(output).isEqualTo(QwenTokenCounter.count(expected.toString()) + 256);
        assertThat(candidate.toString()).isEqualTo(original);
        assertThat(output).isGreaterThan(QwenTokenCounter.count(expected.toString()));
        String source = "원본 근거 전체: 900mL 2개; 판단 변경 금지.";
        assertThat(ReviewClaimTextPatch.prompt(mapper, source, original, failure))
                .startsWith(source + "\nCandidate (all values retained): " + original)
                .contains("/analysis/findings/0/alternativeExplanations/0/text", "/analysis/sessionAssessments/0/explanation/0/text");
    }

    @Test void complete_long_outputs_grow_beyond_the_legacy_reserve_without_a_cap() {
        String prose = "관측된 규격과 수량 900mL 2개를 유지하며 원인과 수행 판단은 불확실합니다. ".repeat(200);
        String candidate = candidate(prose + "(E1)").toString();
        var expected = mapper.createObjectNode();
        expected.putArray("patches").addObject().put("path", "/analysis/summary/0/text").put("value", prose.strip());
        int output = ReviewClaimTextPatch.outputTokens(mapper, candidate);
        assertThat(output).isEqualTo(QwenTokenCounter.count(expected.toString()) + 256)
                .isGreaterThan(ReviewClaimTextPatch.OUTPUT_TOKENS);
    }

    @Test void exact_shape_reservation_can_fit_a_near_limit_request_with_512_extra_safety_tokens() {
        String candidate = candidate("관측 결과는 제한적이며 구매 성공 여부는 확인되지 않았습니다(E1).").toString();
        String prompt = ReviewClaimTextPatch.prompt(mapper, "원본 자료. ".repeat(3000), candidate, failure);
        int output = ReviewClaimTextPatch.outputTokens(mapper, candidate);
        var budget = new AnalysisTokenBudget();
        int limit = budget.total(ReviewClaimTextPatch.SYSTEM, prompt, ReviewClaimTextPatch.OUTPUT_TOKENS) - 1;
        assertThat(budget.total(ReviewClaimTextPatch.SYSTEM, prompt, output) + 512).isLessThanOrEqualTo(limit);
        assertThatThrownBy(() -> budget.requireFits(ReviewClaimTextPatch.SYSTEM, prompt,
                ReviewClaimTextPatch.OUTPUT_TOKENS, limit, "PATCH_EXCEEDS_LIMIT"))
                .hasMessageContaining("PATCH_EXCEEDS_LIMIT");
        assertThatCode(() -> budget.requireFits(ReviewClaimTextPatch.SYSTEM, prompt, output, limit, "PATCH_EXCEEDS_LIMIT"))
                .doesNotThrowAnyException();
    }

    private ObjectNode candidate(String text) {
        var root = mapper.createObjectNode().put("reviewFormat", "claim-evidence-v4");
        var analysis = root.putObject("analysis");
        analysis.putArray("summary").addObject().put("text", text).putArray("evidenceEventIds").add("E1");
        analysis.putArray("findings");
        analysis.putArray("sessionAssessments");
        return root;
    }
}
