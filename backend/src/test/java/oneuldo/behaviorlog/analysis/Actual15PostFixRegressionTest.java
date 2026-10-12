package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.profile.service.ProfilePromptInstructions;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class Actual15PostFixRegressionTest {
    private final MovementProjectionTest fixture = new MovementProjectionTest();
    private final Path root = Path.of(System.getProperty("oneuldo.fix-fixtures", "../output/post-actual15-fixes-20261012/fixtures"));

    private Path recordOutput(String name) throws java.io.IOException {
        var directory=Path.of(System.getenv().getOrDefault("ONEULDO_TEST_RECORD_OUTPUT","build/test-records/actual15-regression"));
        Files.createDirectories(directory);return directory.resolve(name);
    }
    @Test void all_four_actual_long_sources_fit_with_original_facts_and_repair_headroom() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(root));
        var mapper=fixture.mapper;var codec=new FinalSourceEncoding(mapper);
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",18000);ReflectionTestUtils.setField(budget,"finalOutputTokens",2400);
        var refs=new AnalysisReferences(mapper,fixture.input(fixture.fixture()));var results=new ArrayList<Map<String,Object>>();
        for(int i=0;i<4;i++) {
            String source=Files.readString(root.resolve("long-source-"+i+".json"));var before=codec.decode(mapper.readTree(source));
            if(before.path("stage").asString().startsWith("FINAL:"))before.put("stage",AnalysisSynthesisPrompt.FINAL_STAGE);
            var initial=new LosslessTables(mapper).decode(mapper.readTree(Files.readString(root.resolve("long-original-input-"+i+".json"))));
            before.set("catalogProductCategories",ProductLocationSource.build(mapper,initial.path("matchingContentCatalog")));
            source=before.toString();
            String request=AnalysisReviewPrompt.build(mapper,source,new AiBehaviorAnalysis("",List.of(),List.of(),List.of(),null,List.of()),refs);
            var after=codec.decode(mapper.readTree(request));
            Files.writeString(recordOutput("review-budget-source-"+i+".json"),after.toString());
            // Only the recognized application rule changes; all original movement fields must survive.
            if(before.path(MovementSourceContext.FIELD) instanceof ObjectNode movement
                    && MovementSourceContext.LEGACY_RULE.equals(movement.path("rule").asString()))
                movement.put("rule",MovementSourceContext.RULE);
            for(String field:List.of(SourceEventDetails.FIELD,MovementSourceContext.FIELD,"taskContext","matchingContentCatalog","catalogProductCategories","behaviorTimeline","sourceCoverage"))
                if(before.has(field))assertThat(after.get(field)).as("case %s field %s",i,field).isEqualTo(before.get(field));
            int required=budget.total(AnalysisReviewPrompt.system(),request,2400);
            int draftRequired=before.path("stage").asString().startsWith("FINAL:")
                ? budget.total(FinalAnalysisPromptCompactor.systemPrompt(),codec.encodeReadable(before).toString()
                    + "\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.",2400) : 0;
            results.add(Map.of("fixture",i,"required",required,"draftRequired",draftRequired,"repairReserve",768,"originalFactsPreserved",true));
        }
        Files.writeString(recordOutput("post-fix-long-budgets.json"),mapper.writeValueAsString(results));
        for(var row:results)assertThat((int)row.get("required")+768).as("case %s including repair reserve",row.get("fixture")).isLessThanOrEqualTo(18000);
        for(var row:results)assertThat((int)row.get("draftRequired")).as("case %s actual final draft in current 24K preset",row.get("fixture")).isLessThanOrEqualTo(24000);
    }
    @Test void actual_profile_overflow_fits_after_only_instruction_compaction() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(root.resolve("profile-source-failed.json")));
        var mapper=fixture.mapper;var audit=mapper.readTree(Files.readString(root.resolve("profile-source-failed.json")));var codec=new FinalSourceEncoding(mapper);
        var original=codec.decode(mapper.readTree(audit.path("inputPrompt").asString()));var compact=ProfilePromptInstructions.compact(original);
        for(String field:original.propertyNames())if(!ProfilePromptInstructions.TEXT.containsKey(field) && !field.equals("updateRules"))
            assertThat(compact.get(field)).as(field).isEqualTo(original.get(field));
        var encoded=codec.encode(compact);assertThat(codec.decode(encoded)).isEqualTo(compact);
        int required=new AnalysisTokenBudget().total(audit.path("systemPrompt").asString(),encoded.toString(),2400);
        assertThat(required+512).isLessThanOrEqualTo(18000);
        Files.writeString(recordOutput("post-fix-profile-budget.json"),mapper.writeValueAsString(Map.of("required",required,"repairReserve",512,"originalFactsPreserved",true)));
    }
    @Test void actual_wrong_station_candidate_gets_catalog_source_and_quoted_rejection() throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(root.resolve("wrong-product-station.json")));
        var mapper=fixture.mapper;var data=mapper.readTree(Files.readString(root.resolve("wrong-product-station.json")));
        var originalInput=new LosslessTables(mapper).decode(data.path("originalInput"));
        var source=(ObjectNode)data.path("source").deepCopy();
        source.set("catalogProductCategories",ProductLocationSource.build(mapper,originalInput.path("matchingContentCatalog")));
        String candidate=data.path("candidate").toString();String prompt=AnalysisPlanSemanticReview.prompt(mapper,source.toString(),candidate);
        boolean found=false;
        for(var p:mapper.readTree(prompt).path("sourceFacts").path("catalogProducts"))
            if(p.path("id").asString().equals("vegetable-dumpling")) {found=true;assertThat(p.path("categoryId").asString()).isEqualTo("meal");}
        assertThat(found).isTrue();
        String quote=data.path("candidate").path("analysis").path("uncertainties").get(0).asString();
        var review=mapper.createObjectNode().put("verdict","REPAIR");review.putArray("checkedDimensions").add("STATION_IDENTITY");
        review.putArray("issues").addObject().put("code","PRODUCT_STATION_MISMATCH").put("path","/uncertainties/0").put("quote",quote)
            .put("explanation","실제 상품군 meal과 방문 매대 fresh를 혼동했습니다.");
        assertThatThrownBy(()->AnalysisPlanSemanticReview.validate(mapper,review.toString(),candidate))
            .isInstanceOf(AnalysisPlanSemanticReview.Rejected.class);
        // The independent model decides rejection; this confirms only literal source/quote/error wiring.
        Files.writeString(recordOutput("new-source-location-review-request.json"),prompt);
    }
}
