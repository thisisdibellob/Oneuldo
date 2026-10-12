package oneuldo.behaviorlog.analysis;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

/** Saved actual error plus an explicitly authored control, not new persona plays or learning evidence. */
@EnabledIfEnvironmentVariable(named="AI_ACTUAL15_LOCATION_LIVE", matches="true")
class Actual15ProductLocationLiveTest {
    @Test void school_model_rejects_actual_wrong_location_and_accepts_literal_control() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var root=Path.of("../output/post-actual15-fixes-20261012");
        var data=mapper.readTree(Files.readString(root.resolve("fixtures/wrong-product-station.json")));
        var source=(ObjectNode)data.path("source").deepCopy();
        var initial=new LosslessTables(mapper).decode(data.path("originalInput"));
        source.set("catalogProductCategories",ProductLocationSource.build(mapper,initial.path("matchingContentCatalog")));
        var key=Files.readString(Path.of(System.getProperty("user.home"),".local/share/oneuldo/school-gateway-client.key")).strip();
        var config=new OllamaProperties("http://127.0.0.1:18083","qwen3.6:27b-q4_K_M",18432,Duration.ofMinutes(6),Duration.ofSeconds(10),8,"10m",key);
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build());
        http.setReadTimeout(Duration.ofMinutes(6));
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(config.baseUrl()).requestFactory(http).build(),config);
        var results=new ArrayList<Boolean>();
        for(String name:List.of("actual-wrong-location","literal-control")) {
            var candidate=(ObjectNode)data.path("candidate").deepCopy();
            if(name.equals("literal-control")) {
                // Deliberate test control: no new participant action or model-authored analysis is claimed.
                candidate=(ObjectNode)mapper.readTree(candidate.toString().replace("냉동 식품 선반(fresh)","냉장 식품 선반(fresh)"));
                ((ObjectNode)candidate.path("analysis")).putArray("uncertainties")
                    .add("채소 만두를 선택하지 않은 이유는 이 기록만으로 확인되지 않습니다.");
            }
            var audit=mapper.createObjectNode().put("case",name).put("newGamePlays",0).put("databaseWrites",false)
                .put("candidateOrigin",name.equals("literal-control")?"explicitly-authored-test-control":"saved-actual-model-output")
                .put("reviewVersion",AnalysisPlanSemanticReview.VERSION).put("startedAt",Instant.now().toString());
            String prompt=AnalysisPlanSemanticReview.prompt(mapper,source.toString(),candidate.toString());
            audit.put("systemPrompt",AnalysisPlanSemanticReview.system()).put("inputPrompt",prompt).set("candidate",candidate);
            Path file=root.resolve("live-"+name+".json");
            Files.writeString(file,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(audit));
            boolean matched=false;
            try {
                var response=client.complete(AnalysisPlanSemanticReview.system(),prompt,AnalysisPlanSemanticReview.OUTPUT_TOKENS,0.0);
                audit.set("response",mapper.valueToTree(response));
                try {
                    AnalysisPlanSemanticReview.validate(mapper,response.text(),candidate.toString());
                    audit.put("validatedVerdict","VALID");matched=name.equals("literal-control");
                } catch(AnalysisPlanSemanticReview.Rejected rejected) {
                    audit.put("validatedVerdict","REPAIR");
                    matched=name.equals("actual-wrong-location") && response.text().contains("PRODUCT_STATION_MISMATCH");
                }
            } catch(RuntimeException failure) { audit.put("error",failure.getClass().getSimpleName()+": "+failure.getMessage()); }
            audit.put("expectedBoundaryMatched",matched).put("completedAt",Instant.now().toString());
            Files.writeString(file,mapper.writerWithDefaultPrettyPrinter().writeValueAsString(audit));results.add(matched);
        }
        assertThat(results).allMatch(Boolean::booleanValue);
    }
}
