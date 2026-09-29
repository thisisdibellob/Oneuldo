package oneuldo.behaviorlog.profile.service;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.AnalysisReferences;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Offline replay of genuine local HF outputs. No fake HTTP envelope or repair. */
@EnabledIfEnvironmentVariable(named="ONEULDO_CHECK_MATCHED_COMPARISON", matches="true")
class FinetuningMatchedComparisonTest {
    @Test void validate_both_frozen_evaluation_passes_without_repair() throws Exception {
        var helper=new FinetuningNativeExportTest();var mapper=helper.mapper;
        var dir=Path.of("../docs/ai/finetuning/full-training-v1");
        var protocol=mapper.readTree(Files.readString(dir.resolve("protocol.json")));
        var frozen=Files.readAllBytes(helper.out.resolve("eval.candidate.jsonl"));
        assertThat(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(frozen)))
            .isEqualTo(protocol.path("frozen_eval_full_sha256").asString());
        var phases=List.of(System.getenv().getOrDefault("ONEULDO_COMPARISON_PHASES","before,after").split(","));
        assertThat(phases).isNotEmpty().allMatch(p->p.equals("before")||p.equals("after"));
        for(String phase:phases) {
            var results=mapper.createArrayNode();int accepted=0;
            for(String line:Files.readAllLines(helper.out.resolve("eval.candidate.jsonl"))) {
                var row=mapper.readTree(line);String id=row.path("id").asString();
                var saved=mapper.readTree(Files.readString(dir.resolve("results/"+phase+"/"+id+".json")));
                assertThat(saved.path("backend").asString()).isEqualTo("local_hf");
                assertThat(saved.path("phase").asString()).isEqualTo(phase);
                assertThat(saved.path("messages").size()).isEqualTo(2);
                for(int i=0;i<2;i++)assertThat(saved.path("messages").get(i)).as(id).isEqualTo(row.path("messages").get(i));
                String raw=saved.path("content").asString();
                var result=results.addObject();result.put("id",id);result.put("task",row.path("task").asString());
                result.put("stop_reason",saved.path("stop_reason").asString());
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
            var report=mapper.createObjectNode();report.put("phase",phase);report.put("cases",25);
            report.put("accepted",accepted);report.put("rejected",25-accepted);
            report.put("semantic_truth_validated",false);report.set("results",results);
            Files.writeString(dir.resolve("results/"+phase+"/production-validation.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report)+"\n");
        }
    }
}
