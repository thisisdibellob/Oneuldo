package oneuldo.behaviorlog.analysis;

import oneuldo.behaviorlog.analysis.service.GroundedTextPatch;
import oneuldo.behaviorlog.analysis.service.PracticeDesignContract;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PartialQuantityRequiredDigitTest {
    final PartialQuantityRepairContextTest fixture=new PartialQuantityRepairContextTest();

    @Test void the_source_verified_required_quantity_may_be_written_as_a_digit_but_no_other_new_number() {
        var source=fixture.source();String summary="수량은 4에서 1로 바뀌고 제출 없이 실패했습니다.";
        var rejected=fixture.rejected(fixture.candidate(summary),source);
        String withTarget=summary+" 중간에 목표 수량인 2에 도달했으나 최종 수량은 달라졌습니다.";
        // Without the source the old rule stands: no new digit at all.
        assertThatThrownBy(()->GroundedTextPatch.apply(fixture.m,rejected,fixture.patch("/summary",withTarget))).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
        var applied=fixture.m.readTree(GroundedTextPatch.apply(fixture.m,rejected,fixture.patch("/summary",withTarget),source.toString()));
        assertThat(applied.at("/analysis/summary").asString()).isEqualTo(withTarget);
        assertThat(PracticeDesignContract.inspect(applied.path("analysis"),source)).isEmpty();
        // A count, a different quantity, or a dropped original digit is still a changed number.
        for(String bad:java.util.List.of(summary+" 목표 수량인 2에 3번 도달했습니다.",summary+" 목표 수량인 5에 도달했습니다.","수량은 4에서 바뀌고 목표 수량인 2에 도달했으나 실패했습니다."))
            assertThatThrownBy(()->GroundedTextPatch.apply(fixture.m,rejected,fixture.patch("/summary",bad),source.toString())).hasMessage("GROUNDED_PATCH_CHANGED_NUMBERS");
    }
}
