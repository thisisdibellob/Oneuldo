package oneuldo.behaviorlog.analysis;

import oneuldo.behaviorlog.analysis.service.AnalysisReviewPrompt;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class TaskComparisonSourceTest {
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test void keeps_allowed_substitutes_and_every_submission_without_calculating_an_outcome() {
        var original = mapper.readTree("""
                {"taskContext":[{"sessionId":"S1","sourceEventId":"E1","mission":{
                  "successMessage":"SUCCESS static template", "objectives":[{"quantity":2,"acceptedProductIds":["apple","green-apple"]}]}}],
                 "sourceEventDetails":[
                  {"id":"E2","eventCode":"SHOP.CART_OPENED","cart":{"unrelated":3}},
                  {"id":"E3","sessionId":"S1","eventCode":"SHOP.CHECKOUT_SUBMITTED","cart":{"green-apple":2}},
                  {"id":"E4","sessionId":"S1","eventCode":"SHOP.CHECKOUT_SUBMITTED","cart":{"apple":1}}]}
                """);
        var before = original.deepCopy();
        var projection = AnalysisReviewPrompt.taskComparisonSource(mapper, original);
        assertThat(projection.path("requirements").get(0).path("objectives"))
                .isEqualTo(original.path("taskContext").get(0).path("mission").path("objectives"));
        assertThat(projection.path("requirements").get(0).path("sourceEventId").asString()).isEqualTo("E1");
        assertThat(projection.path("submissions").size()).isEqualTo(2);
        assertThat(projection.path("submissions").get(0)).isEqualTo(original.path("sourceEventDetails").get(1));
        assertThat(projection.path("submissions").get(1)).isEqualTo(original.path("sourceEventDetails").get(2));
        assertThat(projection.toString()).doesNotContain("judgment", "SUCCESS", "FAILURE");
        assertThat(original).isEqualTo(before);
    }

    @Test void missing_goal_or_submission_is_not_invented_from_cart_opening() {
        var original = mapper.readTree("""
                {"sourceEventDetails":[{"id":"E1","eventCode":"SHOP.CART_OPENED","cart":{"milk":1}}]}
                """);
        var projection = AnalysisReviewPrompt.taskComparisonSource(mapper, original);
        assertThat(projection.path("requirements").isEmpty()).isTrue();
        assertThat(projection.path("submissions").isEmpty()).isTrue();
    }
}
