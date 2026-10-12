package oneuldo.behaviorlog.analysis;

import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class FinalAnalysisBudgetTest {
    final MovementProjectionTest fixture = new MovementProjectionTest();
    final AnalysisTokenBudget budget = new AnalysisTokenBudget();
    final AiBehaviorAnalysisPromptFactory prompts = new AiBehaviorAnalysisPromptFactory(fixture.mapper);

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints={1800,2400})
    void estimates_actual_review_template_for_short_medium_and_large_sources(int outputLimit) {
        ReflectionTestUtils.setField(budget,"requestTokens",18000);
        ReflectionTestUtils.setField(budget,"finalOutputTokens",outputLimit);
        int previous = 0;
        for (int count : List.of(3, 60, 6000)) {
            ObjectNode root = fixture.fixture();
            var session = (ObjectNode)root.path("input").path("sessions").get(0);
            var template = session.path("events").get(0).deepCopy();
            var events = session.putArray("events");
            for (int i=0;i<count;i++) {
                var event=(ObjectNode)template.deepCopy();
                event.put("behaviorLogId",UUID.randomUUID().toString()).put("sequence",i+1);
                events.add(event);
            }
            root.put("eventCount",count); ((ObjectNode)root.path("input")).put("eventCount",count);
            var input = fixture.input(root);
            var refs = new AnalysisReferences(fixture.mapper,input);
            String source = refs.encode(prompts.wholeSourcePrompt(input));
            var estimate = FinalAnalysisBudget.estimate(fixture.mapper,budget,prompts.wholeSourceSystem(),source,refs,true,"");
            var draft = refs.read(new CompactPipelineTest().finalJson);
            String actualReview = AnalysisReviewPrompt.build(fixture.mapper,source,draft,refs);
            assertThat(actualReview).doesNotContain("draftToReview");
            assertThat(estimate.reviewRequest()).isEqualTo(budget.total(AnalysisReviewPrompt.system(),actualReview,outputLimit) + 256);
            assertThat(estimate.required()).isEqualTo(Math.max(estimate.draftRequest(),estimate.reviewRequest()));
            assertThat(estimate.required()).isGreaterThan(previous);
            previous=estimate.required();
            if(count==3) assertThat(estimate.required()).isLessThanOrEqualTo(18000);
            if(count==6000) assertThat(estimate.required()).isGreaterThan(18000);
        }
    }

    @Test void without_review_reserves_only_one_request_and_actual_request_guard_is_not_bypassed() {
        var input=fixture.input(fixture.fixture());
        var refs=new AnalysisReferences(fixture.mapper,input);
        String source=refs.encode(prompts.wholeSourcePrompt(input));
        var estimate=FinalAnalysisBudget.estimate(fixture.mapper,budget,prompts.wholeSourceSystem(),source,refs,false,"");
        assertThat(estimate.reviewRequest()).isZero();
        assertThat(estimate.required()).isEqualTo(budget.total(prompts.wholeSourceSystem(),source));
        assertThatThrownBy(()->budget.requireFits(prompts.wholeSourceSystem(),source,estimate.required()-1,"EXACT_REQUEST_TOO_LARGE"))
                .hasMessageContaining("EXACT_REQUEST_TOO_LARGE");
    }
}
