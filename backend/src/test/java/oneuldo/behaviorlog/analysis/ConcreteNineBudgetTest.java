package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="AI_CONCRETE_NINE_BUDGET",matches="true")
class ConcreteNineBudgetTest {
    @Test void detailedDesignFitsTheSameRequestBudgetForEveryHistoricalSource()throws Exception{
        var m=JsonMapper.builder().findAndAddModules().build();var run=Path.of("../output/concrete-speed-nine-20261025");
        var manifest=m.readTree(Files.readString(run.resolve("manifest.json")));var reports=m.createArrayNode();
        var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",32000);
        ReflectionTestUtils.setField(budget,"finalOutputTokens",3200);
        for(var c:manifest.path("cases")){
            var input=m.readValue(Files.readString(Path.of(c.path("sourcePath").asString())),BehaviorAnalysisInput.class);
            var response=new BehaviorAnalysisInputResponse(input.datasetId(),input.schemaVersion(),input.generatedAt(),input.sessionCount(),input.eventCount(),input);
            var refs=new AnalysisReferences(m,response);var p=new AiBehaviorAnalysisPromptFactory(m);
            String source=AnalysisSynthesisPrompt.build(m,p,response,List.of(),refs,false);
            String review=AnalysisReviewWire.prompt(m,AnalysisReviewPrompt.build(m,source,null,refs),true);
            int tokens=budget.total(AnalysisReviewPrompt.system(),review,3200);
            reports.addObject().put("key",c.path("key").asString()).put("requestWithOutputTokens",tokens)
                .put("productSourceRows",new FinalSourceEncoding(m).decode(m.readTree(source)).path("practiceProductSources").size());
            Files.writeString(run.resolve("concrete-plan-budget.json"),m.writerWithDefaultPrettyPrinter().writeValueAsString(reports));
            // 500 tokens remain for the existing retry/framing checks, not for new evidence.
            assertThat(tokens).as(c.path("key").asString()).isLessThanOrEqualTo(31500);
        }
    }
}
