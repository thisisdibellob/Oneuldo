package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class FinalRec2SourceBudgetTest {
    final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
    final Path root=Path.of("../output/minjae-five-memory-connected-20261028/auditor");
    final String retry="\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.";

    @Test void actual_failed_final_review_has_a_reproducible_exact_token_breakdown() throws Exception {
        assumeTrue(Files.isRegularFile(root.resolve("analyses.json"))&&Files.isRegularFile(root.resolve("input-snapshots.json")));
        JsonNode failed=null;
        for(var row:m.readTree(Files.readString(root.resolve("analyses.json"))))if(row.path("id").asString().startsWith("452521e0"))failed=row;
        assumeTrue(failed!=null,"Preserved failed recommendation-2 final source");
        var preflight=failed.path("attempts").get(failed.path("attempts").size()-1);
        assertThat(preflight.path("source").asString()).isEqualTo("PREFLIGHT");
        BehaviorAnalysisInput input=null;
        for(var row:m.readTree(Files.readString(root.resolve("input-snapshots.json"))))
            if(row.path("id").asString().equals(failed.path("dataset_id").asString()))input=m.treeToValue(row.path("input_data"),BehaviorAnalysisInput.class);
        assertThat(input).isNotNull();
        var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
        var refs=new AnalysisReferences(m,response);var budget=new AnalysisTokenBudget();
        ReflectionTestUtils.setField(budget,"requestTokens",32000);ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
        var estimate=FinalAnalysisBudget.estimate(m,budget,preflight.path("systemPrompt").asString(),preflight.path("inputPrompt").asString(),refs,true,true,retry);
        String wire=AnalysisReviewWire.prompt(m,estimate.preparedReview(),true);
        int required=budget.total(AnalysisReviewPrompt.system(),wire+retry,3200)+256;
        var parsed=(ObjectNode)m.readTree(wire);var beforeTable=parsed.deepCopy();
        var oldFacts=(ObjectNode)beforeTable.path(ReadableSourceFacts.FIELD);
        oldFacts.set("eventsById",ReadableQuantityRows.decode(m,oldFacts.path("eventsById")));
        int beforeRequired=budget.total(AnalysisReviewPrompt.system(),beforeTable.toString()+retry,3200)+256;
        assertThat(beforeRequired).isEqualTo(33607);
        var codec=new FinalSourceEncoding(m);
        assertThat(codec.decode(parsed)).isEqualTo(codec.decode(beforeTable));
        var original=codec.decode(m.readTree(preflight.path("inputPrompt").asString()));var sourceBefore=original.deepCopy();
        assertThat(codec.decode(codec.encodeReadable(original))).isEqualTo(sourceBefore);
        assertThat(original).isEqualTo(sourceBefore);
        var literal=parsed.path(ReadableSourceFacts.FIELD).path("eventsById");
        assertThat(literal.toString()).doesNotContain("\"$nf\"","\"$nc\"","\"$r\"","\"$a\"","\"$m\"");
        var report=m.createObjectNode().put("sourceAnalysisId",failed.path("id").asString()).put("required",required)
            .put("beforeRequired",beforeRequired).put("savedTokens",beforeRequired-required)
            .put("limit",32000).put("outputReservation",3200).put("reviewMargin",256)
            .put("systemTokens",QwenTokenCounter.count(AnalysisReviewPrompt.system())).put("wireTokens",QwenTokenCounter.count(wire));
        var sizes=report.putObject("wireFieldTokens");
        for(String field:parsed.propertyNames())sizes.put(field,QwenTokenCounter.count(m.createObjectNode().set(field,parsed.get(field)).toString()));
        var output=Path.of("build/test-records/final-rec2-token-breakdown.json");Files.createDirectories(output.getParent());Files.writeString(output,m.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
        System.out.println(m.writeValueAsString(report));
        assertThat(required).isLessThanOrEqualTo(32000);
    }
}
