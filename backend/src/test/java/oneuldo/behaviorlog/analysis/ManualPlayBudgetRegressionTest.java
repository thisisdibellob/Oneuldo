package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

/** Immutable human-play replay: no provider calls, new play, source selection or rounding. */
class ManualPlayBudgetRegressionTest {
    @Test void original370EventEvidenceAndReadableFactsSurvivePackingWithinExpandedBudget() throws Exception {
        Path run=Path.of("../output/manual-reanalysis-20261012");
        Path fixture=run.resolve("original-analysis-and-input.json");assumeTrue(Files.exists(fixture));
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var saved=mapper.readTree(Files.readString(fixture));
        var input=mapper.treeToValue(saved.path("input"),BehaviorAnalysisInput.class);
        assertThat(input.eventCount()).isEqualTo(370);
        var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
        var refs=new AnalysisReferences(mapper,response);var codec=new FinalSourceEncoding(mapper);
        var attempts=saved.path("analysis").path("attempts");var failed=attempts.get(attempts.size()-1);
        var original=codec.decode(mapper.readTree(failed.path("inputPrompt").asString()));
        var facts=original.remove(ReadableSourceFacts.FIELD);
        var before=original.deepCopy();var encoded=codec.encodeReadable(original);
        var restored=codec.decode(mapper.readTree(encoded.toString()));var retainedFacts=restored.remove(ReadableSourceFacts.FIELD);
        assertThat(restored).isEqualTo(before);assertThat(original).isEqualTo(before);assertThat(retainedFacts).isEqualTo(facts);
        String packed=mapper.writeValueAsString(encoded);String review=AnalysisReviewPrompt.build(mapper,packed,null,refs);
        var reviewed=codec.decode(mapper.readTree(review));
        for(String field:List.of("sourceEventDetails","sourceMovementContext","taskContext","readableSourceFacts"))
            assertThat(reviewed.path(field)).isEqualTo(field.equals("readableSourceFacts")?facts:before.path(field));
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",24000);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
        var estimate=FinalAnalysisBudget.estimate(mapper,budget,failed.path("systemPrompt").asString(),packed,refs,true,
                "\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.");
        assertThat(estimate.required()).isLessThanOrEqualTo(24000);
        int beforeTokens=QwenTokenCounter.count(failed.path("inputPrompt").asString()),afterTokens=QwenTokenCounter.count(packed);
        assertThat(afterTokens).isLessThanOrEqualTo(beforeTokens);
        Files.writeString(run.resolve("lossless-budget-regression.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                "allOriginalSourceFieldsValuesAndOrderPreserved",true,"readableFactsPreserved",true,"eventCount",370,
                "sourceTokensBefore",beforeTokens,"sourceTokensAfter",afterTokens,"draftBudget",estimate.draftRequest(),
                "reviewBudget",estimate.reviewRequest(),"limit",24000,"outputReserve",3200,"liveProviderCalls",0))+"\n");
    }
}
