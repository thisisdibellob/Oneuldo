package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.AnalysisReferences;
import static org.assertj.core.api.Assertions.*;

class DigestShapeTest {
    final MovementProjectionTest fixture = new MovementProjectionTest();
    final AnalysisReferences refs = new AnalysisReferences(fixture.mapper, fixture.input(fixture.fixture()));
    String digest(String alternative, String evidence) {
        return "{\"s\":\"관찰\",\"o\":[[\"이동 기록\",\"탐색 가능성\"," + alternative + "," + evidence + "]],\"u\":[\"동기 불명\"]}";
    }
    @Test void single_values_are_wrapped_without_rewriting_text() {
        var result = refs.readDigest(digest("\"대안 A, 또는 B\"", "\"E1\""));
        assertThat(result.observations().getFirst().alternativeExplanations()).containsExactly("대안 A, 또는 B");
        assertThat(result.observations().getFirst().evidenceEventIds()).hasSize(1);
        assertThat(refs.readDigest(digest("[\"대안 A, 또는 B\"]", "[\"E1\"]"))).isEqualTo(result);
    }
    @Test void unknown_combined_numeric_and_truncated_references_still_fail() {
        for (String evidence : new String[]{"\"E999\"", "\"E1, E2\"", "[1]", "null", "[]"}) {
            if (evidence.equals("[]")) continue; // Empty evidence remains the validator's responsibility.
            assertThatThrownBy(() -> refs.readDigest(digest("\"대안\"", evidence))).isInstanceOf(RuntimeException.class);
        }
        assertThatThrownBy(() -> refs.readDigest("{\"s\":")).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> refs.readDigest(digest("null", "[\"E1\"]"))).hasMessage("ALTERNATIVE_EXPLANATIONS_MUST_BE_ARRAY");
    }
}
