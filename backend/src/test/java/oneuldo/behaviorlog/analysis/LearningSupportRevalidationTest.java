package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Offline validation of already-generated answers. Never counted as additional model calls. */
@EnabledIfEnvironmentVariable(named="AI_LEARNING_SUPPORT_REVALIDATE",matches="true")
class LearningSupportRevalidationTest {
    @Test void same_three_answers_pass_after_citation_set_normalization() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var dir=Path.of("../output/learning-support-fix-20261001");
        for(String name:List.of("baseline","supported","probe")) {
            var original=mapper.readTree(Files.readString(dir.resolve(name+"-fresh-analysis.json")));
            var input=mapper.readValue(Files.readString(dir.resolve("fixtures/"+name+"-input.json")),BehaviorAnalysisInputResponse.class);
            var refs=new AnalysisReferences(mapper,input);
            var analysis=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator()).validate(
                refs.read(AnalysisReviewPrompt.reviewedAnalysis(mapper,original.path("response").path("text").asString(),refs)),input);
            assertThat(analysis.sessionAssessments().getFirst().judgment()).isEqualTo(name.equals("supported")?"SUCCESS":"FAILURE");
            var report=mapper.createObjectNode();report.put("scope","offline revalidation; original model output preserved; zero extra calls");
            report.put("originalStatus",original.path("status").asString());report.put("status","READY");
            report.set("analysis",mapper.valueToTree(analysis));
            Files.writeString(dir.resolve(name+"-revalidated.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
    }
}
