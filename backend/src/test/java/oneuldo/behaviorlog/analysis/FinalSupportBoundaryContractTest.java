package oneuldo.behaviorlog.analysis;

import oneuldo.behaviorlog.analysis.service.AnalysisReviewPrompt;
import oneuldo.behaviorlog.analysis.service.FinalAnalysisPromptCompactor;
import oneuldo.behaviorlog.analysis.service.QwenTokenCounter;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class FinalSupportBoundaryContractTest {
    @Test void final_and_review_keep_required_goals_separate_from_hints_and_define_ai_selected_support_modes() {
        for (String system : java.util.List.of(FinalAnalysisPromptCompactor.systemPrompt(), AnalysisReviewPrompt.system()))
            assertThat(system).contains("required task information, not extra hints", "actual comparison/correction wording",
                    "REDUCED labels alone prove no change", "GUIDED_PRACTICE/SIMPLIFIED", "SUPPORT_FADING/STANDARD",
                    "same demands/choices, fewer procedural hints", "INDEPENDENT_PROBE/REDUCED", "keep the goal list, no extra hints",
                    "The AI decides performance/practice; the server checks source IDs and executable bounds only");
        var fixture = new MovementProjectionTest();
        var source = fixture.mapper.createObjectNode();
        var wire = new FinalAnalysisPromptCompactor(fixture.mapper).compactInstructions(source);
        assertThat(wire.path("finalInputVersion").asString()).isEqualTo("final-input-v8-support-boundaries");
        assertThat(source.isEmpty()).isTrue();
    }

    @Test void restored_support_boundaries_add_at_most_150_model_tokens() {
        String policy = FinalAnalysisPromptCompactor.systemPrompt();
        String before = policy.lines().filter(line -> !line.startsWith("Objective names/specs/")
                && !line.startsWith("AI chooses GUIDED_PRACTICE/")).collect(java.util.stream.Collectors.joining("\n")) + "\n";
        int added = QwenTokenCounter.count(policy) - QwenTokenCounter.count(before);
        assertThat(added).isBetween(1, 150);
    }
}
