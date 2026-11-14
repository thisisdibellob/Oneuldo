package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class LiveSourceQualityRegressionTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    @Test void new_help_and_removal_claims_cannot_escape_the_existing_batch_gate(){
        var analysis=m.readTree("{\"uncertainties\":[\"상품을 담았다가 제거했을 가능성이 있다\"],\"findings\":[{\"interpretation\":\"도움말 의존 감소가 나타났습니다\",\"suggestedSupport\":\"목표 방향 화살표와 장바구니 수량 부족 알림을 제공한다. 음성은 미지원이다.\"}]}");
        assertThat(GroundedPracticeContract.inspect(analysis,m.createObjectNode(),false)).extracting(GroundedPracticeContract.Violation::code)
            .contains("UNRECORDED_ACTION_HYPOTHESIS","UNCONFIRMED_CAUSE","UNSUPPORTED_CAPABILITY");
        var valid=m.readTree("{\"summary\":\"일반 도움말을 한 번 열었습니다. 실제 도움 제공과 이해 여부는 확인되지 않습니다.\",\"practicePlan\":{\"rationale\":\"목표 매대를 열고 수량을 확인하는 텍스트 안내를 제공한다\"}}");
        assertThat(GroundedPracticeContract.inspect(valid,m.createObjectNode(),false)).isEmpty();
    }
    @Test void observed_add_and_remove_can_be_described_and_directions_in_text_are_supported(){
        var source=m.readTree("{\"events\":[{\"eventCode\":\"SHOP.QUANTITY_CHANGED\",\"quantityBefore\":1,\"quantityAfter\":0}]}");
        assertThat(GroundedPracticeContract.inspect(m.readTree("{\"summary\":\"상품을 담은 후 제거했습니다\",\"practicePlan\":{\"rationale\":\"안내문으로 냉장 매대 방향을 알려준다\"}}"),source,false)).isEmpty();
    }
    @Test void a_goal_can_mix_explicit_sku_and_literal_name_without_a_false_item_count_error(){
        var source=m.createObjectNode();PracticeDesignContract.attach(m,source,m.readTree("{\"products\":[{\"id\":\"milk\",\"name\":\"흰 우유\",\"price\":2200},{\"id\":\"water\",\"name\":\"생수\",\"price\":800}]}"));
        var analysis=m.readTree("{\"summary\":\"기록 검토\",\"practicePlan\":{\"goal\":\"흰 우유(milk) 1개와 생수 1개를 담는다\",\"itemCount\":2,\"rationale\":\"변경: 목표를 줄인다. 안내: 매대를 열고 선택한다. 달성: 두 상품을 담고 배우가 제출한다. 확인: 수량 조절과 제출\"}}");
        assertThat(GroundedPracticeContract.inspect(analysis,source,true)).isEmpty();
    }
    @Test void actual_nine_sources_stay_identical_and_the_apple_juice_conflict_is_exposed()throws Exception{
        var root=Path.of("../output/mcp-live-nine-shadow-experts-20261025");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(root.resolve("record-inputs/07.json")));
        var rows=m.createArrayNode();
        for(int n=1;n<=9;n++) {
            var file=root.resolve("record-inputs/%02d.json".formatted(n));String raw=Files.readString(file),hash=QwenTokenCounter.textHash(raw);
            var input=m.treeToValue(m.readTree(raw),BehaviorAnalysisInput.class);
            var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
            var source=m.createObjectNode();PracticeDesignContract.attach(m,source,m.readTree(raw));source.set(SessionSourceLedger.FIELD,SessionSourceLedger.build(m,m.readTree(raw)));
            var row=rows.addObject().put("case",n).put("sourceSha256",hash).put("events",input.eventCount());
            row.set("recordedProductSpecificationConflicts",source.path("recordedProductSpecificationConflicts"));
            if(n==7) {
                assertThat(source.path("recordedProductSpecificationConflicts")).isNotEmpty();
                var analysis=m.readTree("{\"summary\":\"빈 장바구니를 시스템이 제출했다\",\"practicePlan\":{\"goal\":\"흰 우유(milk) 1개\",\"itemCount\":1,\"rationale\":\"변경: 목표 축소. 안내: 냉장 매대를 연 후 우유를 선택한다. 달성: 우유 1개를 담고 배우가 제출한다. 확인: 선택과 수량\"}}");
                assertThat(GroundedPracticeContract.inspect(analysis,source,false)).extracting(GroundedPracticeContract.Violation::code).contains("RECORDED_PRODUCT_CONFLICT_OMITTED");
            }
            assertThat(QwenTokenCounter.textHash(Files.readString(file))).isEqualTo(hash);
            // Source detail construction may project views but must never mutate the input.
            tools.jackson.databind.JsonNode before=m.valueToTree(input);SourceEventDetails.build(m,response);assertThat((tools.jackson.databind.JsonNode)m.valueToTree(input)).isEqualTo(before);
        }
        var out=Path.of("../output/speed-quality-improvement-20261026");Files.createDirectories(out);
        Files.writeString(out.resolve("nine-original-source-check.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(rows)+"\n");
    }
    @Test void measure_lossless_review_savings_and_reject_known_actual_output_defects()throws Exception {
        var root=Path.of("../output/mcp-live-nine-shadow-experts-20261025");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(root.resolve("results-summary.json")));
        var report=m.createObjectNode().put("scope","Retrospective original-output checks and exact token counts; no fresh AI inference or measured wall-time reduction.");
        var rows=report.putArray("cases");long beforeTotal=0,afterTotal=0;
        for(var c:m.readTree(Files.readString(root.resolve("results-summary.json"))).path("records")) {
            int n=c.path("case").asInt();var dir=root.resolve(c.path("directory").asString());
            var stored=m.readTree(Files.readString(dir.resolve("original-ai-analysis.json")));
            var attempts=stored.path("attempts");tools.jackson.databind.JsonNode actual=null;
            for(var a:attempts)if(a.path("source").asString().equals("PLAN_SOURCE_REVIEW")&&a.path("errorCode").isNull())actual=a;
            assertThat(actual).as("case %s actual semantic review",n).isNotNull();
            String before=actual.path("inputPrompt").asString();var decoded=(tools.jackson.databind.node.ObjectNode)m.readTree(before);
            String after=ReviewSourceTransport.encode(m,decoded);
            assertThat(new FinalSourceEncoding(m).decode(m.readTree(after))).isEqualTo(decoded);
            int bt=QwenTokenCounter.count(before),at=QwenTokenCounter.count(after);assertThat(at).isLessThanOrEqualTo(bt);
            beforeTotal+=bt;afterTotal+=at;
            var raw=m.readTree(Files.readString(root.resolve("record-inputs/%02d.json".formatted(n))));var source=(tools.jackson.databind.node.ObjectNode)raw.deepCopy();PracticeDesignContract.attach(m,source,raw);source.set(SessionSourceLedger.FIELD,SessionSourceLedger.build(m,raw));
            var issues=GroundedPracticeContract.inspect(stored.path("result"),source,true);
            var row=rows.addObject().put("case",n).put("beforeReviewInputTokens",bt).put("afterReviewInputTokens",at).put("sourceRoundTripExact",true);
            row.set("detectedOriginalOutputIssues",m.valueToTree(issues));
            var profiles=m.readTree(Files.readString(dir.resolve("original-ai-profiles.json")));
            var profile=profiles.get(profiles.size()-1).path("profile");
            var profileIssues=GroundedPracticeContract.inspect(profile,source,true);row.set("detectedOriginalProfileIssues",m.valueToTree(profileIssues));
            if(n==1||n==5)assertThat(profileIssues).extracting(GroundedPracticeContract.Violation::code).contains("UNCONFIRMED_CAUSE");
            if(n==2)assertThat(issues).extracting(GroundedPracticeContract.Violation::code).contains("PARTIAL_QUANTITY_EVIDENCE_OMITTED");
            if(n==6)assertThat(issues).extracting(GroundedPracticeContract.Violation::code).contains("CONCRETE_PRODUCT_QUANTITY_REQUIRED");
            if(n==8)assertThat(issues).extracting(GroundedPracticeContract.Violation::code).contains("PRACTICE_CRITERION_SCOPE_MISMATCH");
            if(n==9)assertThat(issues).extracting(GroundedPracticeContract.Violation::code).contains("UNSUPPORTED_CAPABILITY");
        }
        report.put("beforeReviewInputTokens",beforeTotal).put("afterReviewInputTokens",afterTotal).put("inputTokenReductionPercent",100.0*(beforeTotal-afterTotal)/beforeTotal);
        var out=Path.of("../output/speed-quality-improvement-20261026");Files.createDirectories(out);
        Files.writeString(out.resolve("nine-review-transport-and-quality.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
    }
}
