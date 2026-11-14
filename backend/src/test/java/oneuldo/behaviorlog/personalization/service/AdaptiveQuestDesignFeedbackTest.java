package oneuldo.behaviorlog.personalization.service;

import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class AdaptiveQuestDesignFeedbackTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    final ObjectNode options=(ObjectNode)m.readTree("{\"/environmentPlan/shelfOrder\":[[\"fresh\",\"meal\",\"produce\",\"drink\",\"household\"]],\"/runtimePlan/environment/employeeCount\":[3]}");

    ObjectNode plan(String reason) {
        var plan=m.createObjectNode().put("path","/environmentPlan/shelfOrder").put("reason",reason);
        plan.set("value",options.path("/environmentPlan/shelfOrder").get(0).deepCopy());
        return plan;
    }
    ObjectNode rejected(JsonNode plan) {
        try {AdaptiveQuestDesign.validate(plan,options);throw new AssertionError("Invalid design was accepted");}
        catch(RuntimeException error) {return AdaptiveQuestDesign.failureDetails(m,plan,options,error);}
    }
    void hasIssue(JsonNode details,String path,String code) {
        assertThat(details.path("violations").valueStream().toList())
            .anyMatch(v->v.path("path").asString().equals(path)&&v.path("code").asString().equals(code));
        assertThat(AdaptiveQuestDesign.retryFeedback(details)).contains(path,code);
    }

    @Test void actual_allowed_shelf_choices_with_overlong_reasons_report_the_real_length_without_changing_them() {
        // Exact model-authored reasons from failed generation 26397837, CONDITION_DESIGN attempts 2/3.
        var reasons=List.of(
            "이전 세션에서 냉장(fresh) 매대만 접근하여 흰 우유를 선택한 기록이 있습니다. 다음 연습에서는 냉장 매대를 진입 지점(인덱스 0)에 배치하여 첫 번째 목표 품목 접근 경로를 단순화합니다. 음료(drink) 매대는 인덱스 3으로 유지하여, 냉장 매대 탐색 후 음료 매대까지의 이동 거리를 이전 실제 배치와 유사하게 유지합니다. 이는 탐색 오류를 줄이고 기본 구매 흐름을 안정화하기 위한 조건 변경입니다.",
            "지난 세션에서 냉장(fresh) 매대만 방문하여 흰 우유를 선택했으나, 음료(drink) 매대를 방문하지 않아 생수 선택에 실패하고 세션이 중단되었습니다. 다음 연습에서는 냉장 매대를 가장 가까운 위치(인덱스 0)에 배치하여 접근성을 유지하되, 음료 매대를 인덱스 3으로 설정하여 실제 레이아웃에서의 탐색 경로를 명확히 하고 생수 선택을 유도합니다. 이는 이전 실패한 항목의 접근성을 개선하기 위한 조건 변경입니다.");
        var expectedLengths=List.of(227,232);var originalOptions=options.deepCopy();
        for(int i=0;i<reasons.size();i++) {
            var candidate=plan(reasons.get(i));var original=candidate.deepCopy();var details=rejected(candidate);
            hasIssue(details,"/reason","TEXT_TOO_LONG");
            assertThat(details.path("reason").path("length").asInt()).isEqualTo(expectedLengths.get(i));
            assertThat(details.path("reason").path("maxLength").asInt()).isEqualTo(200);
            assertThat(details.path("reason").path("actualType").asString()).isEqualTo("STRING");
            assertThat(details.path("selectedPathAllowed").asBoolean()).isTrue();
            assertThat(details.path("selectedValueAllowed").asBoolean()).isTrue();
            assertThat(details.path("allowedValues")).isEqualTo(options.path("/environmentPlan/shelfOrder"));
            assertThat(details.path("violations").size()).isEqualTo(1);
            assertThat(AdaptiveQuestDesign.retryFeedback(details)).contains("\"length\":"+expectedLengths.get(i),"\"maxLength\":200","Rewrite the JSON yourself");
            assertThat(candidate).isEqualTo(original);assertThat(options).isEqualTo(originalOptions);
        }
        assertThatCode(()->AdaptiveQuestDesign.validate(plan("배치를 바꾼 다음 매대 접근과 상품 선택을 관찰합니다."),options)).doesNotThrowAnyException();
    }

    @Test void the_original_200_utf16_unit_limit_is_unchanged() {
        assertThatCode(()->AdaptiveQuestDesign.validate(plan("가".repeat(200)),options)).doesNotThrowAnyException();
        hasIssue(rejected(plan("가".repeat(201))),"/reason","TEXT_TOO_LONG");
        assertThatCode(()->AdaptiveQuestDesign.validate(plan("😀".repeat(100)),options)).doesNotThrowAnyException();
        assertThat(rejected(plan("😀".repeat(101))).path("reason").path("length").asInt()).isEqualTo(202);
    }

    @Test void shape_path_value_and_reason_failures_have_distinct_actionable_feedback() {
        var shape=plan("조건 변경을 관찰합니다.");shape.put("extra",true);
        hasIssue(rejected(shape),"/","EXACT_FIELDS_REQUIRED");
        hasIssue(rejected(m.createArrayNode()),"/","OBJECT_REQUIRED");
        var path=plan("조건 변경을 관찰합니다.");path.put("path",4);
        var wrongType=rejected(path);hasIssue(wrongType,"/path","STRING_REQUIRED");
        assertThat(wrongType.path("violations").get(0).path("actualType").asString()).isEqualTo("NUMBER");
        path.put("path","/not/editable");var unknownPath=rejected(path);
        hasIssue(unknownPath,"/path","PATH_NOT_ALLOWED");
        assertThat(unknownPath.path("allowedPaths").valueStream().map(JsonNode::asString).toList()).contains("/environmentPlan/shelfOrder");
        var value=plan("조건 변경을 관찰합니다.");value.put("path","/runtimePlan/environment/employeeCount").put("value","3");
        var wrongValue=rejected(value);hasIssue(wrongValue,"/value","VALUE_NOT_ALLOWED");
        assertThat(wrongValue.path("allowedValues").get(0).asInt()).isEqualTo(3);
        assertThat(wrongValue.path("violations").get(0).path("actualType").asString()).isEqualTo("STRING");
        assertThat(wrongValue.path("violations").get(0).path("expectedTypes").get(0).asString()).isEqualTo("NUMBER");
        value.put("value",4);hasIssue(rejected(value),"/value","VALUE_NOT_ALLOWED");
        var reason=plan("조건 변경을 관찰합니다.");reason.put("reason",7);
        hasIssue(rejected(reason),"/reason","STRING_REQUIRED");
        reason.put("reason","  ");hasIssue(rejected(reason),"/reason","NONBLANK_TEXT_REQUIRED");
        reason.remove("reason");hasIssue(rejected(reason),"/reason","STRING_REQUIRED");
    }

    @Test void malformed_json_is_reported_as_shape_failure_instead_of_a_bad_allowed_value() {
        try {m.readTree("{not JSON");throw new AssertionError("Malformed JSON was accepted");}
        catch(RuntimeException error) {
            var details=AdaptiveQuestDesign.failureDetails(m,null,options,error);
            hasIssue(details,"/","JSON_OBJECT_REQUIRED");
            assertThat(details.path("violations").get(0).path("actualType").asString()).isEqualTo("UNPARSED_OR_EMPTY");
            assertThat(details.path("allowedPaths").size()).isEqualTo(2);
        }
    }
}
