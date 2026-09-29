package oneuldo.behaviorlog.profile.service;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.AnalysisReferences;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Replay recorded outputs through production readers/validators; no inference or DB. */
@EnabledIfEnvironmentVariable(named="ONEULDO_CHECK_NATIVE_BASELINE", matches="true")
class FinetuningNativeBaselineTest {
    @Test void record_all_frozen_responses_without_repair() throws Exception {
        var helper=new FinetuningNativeExportTest();var mapper=helper.mapper;
        var dir=Path.of("../docs/ai/finetuning/baseline-native-v2-ssh");
        assertThat(Files.readAllBytes(dir.resolve("eval.frozen.jsonl")))
            .isEqualTo(Files.readAllBytes(helper.out.resolve("eval.candidate.jsonl")));
        var results=mapper.createArrayNode();int accepted=0;
        for(String line:Files.readAllLines(dir.resolve("eval.frozen.jsonl"))) {
            var row=mapper.readTree(line);String id=row.path("id").asString();
            var saved=mapper.readTree(Files.readString(dir.resolve("responses/"+id+".json")));
            assertThat(saved.path("http_status").asInt()).as(id).isEqualTo(200);
            var sent=saved.path("request").path("messages");
            assertThat(sent.size()).isEqualTo(2);
            assertThat(sent.get(0)).isEqualTo(row.path("messages").get(0));
            assertThat(sent.get(1)).isEqualTo(row.path("messages").get(1));
            var envelope=mapper.readTree(saved.path("response_body").asString());
            String raw=envelope.path("message").path("content").asString();
            var result=results.addObject();result.put("id",id);result.put("task",row.path("task").asString());
            var input=helper.fixture(id);
            try {
                Object validated;
                if(row.path("task").asString().equals("session_analysis")) {
                    var dto=mapper.treeToValue(input,BehaviorAnalysisInputResponse.class);
                    validated=helper.validator.validate(new AnalysisReferences(mapper,dto).read(raw),dto);
                } else {
                    var previous=helper.previous(input);var current=helper.current(input);
                    validated=helper.profileValidator.validate(new AiUserProfileReferences(mapper,previous,current).read(raw),previous,current);
                }
                result.put("accepted",true);result.set("expanded",mapper.valueToTree(validated));accepted++;
            } catch(RuntimeException e) {
                result.put("accepted",false);result.put("error_type",e.getClass().getSimpleName());result.put("error",e.getMessage());
            }
        }
        assertThat(results.size()).isEqualTo(25);
        var report=mapper.createObjectNode();report.put("cases",25);report.put("accepted",accepted);
        report.put("rejected",25-accepted);report.put("semantic_truth_validated",false);report.set("results",results);
        Files.writeString(dir.resolve("production-validation.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
    }
}
