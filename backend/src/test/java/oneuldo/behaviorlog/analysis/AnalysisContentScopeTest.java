package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketQuestCatalog;

class AnalysisContentScopeTest {
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    @Test void 미구매_장면상품과_목표대안도_남긴다() {
        var input=fixture(true);
        var catalog=new AnalysisContentScope(mapper).catalog(input);
        List<String> ids=new ArrayList<>();catalog.path("products").forEach(p->ids.add(p.path("id").asString()));
        assertThat(ids).contains("milk","banana","apple").hasSize(3);
    }
    @Test void 장면_누락과_과거버전은_임의로_현재_값을_선택하지_않는다() {
        assertThat(new AnalysisContentScope(mapper).catalog(fixture(false)).path("products").size()).isEqualTo(60);
        var tree=mapper.valueToTree(fixture(true));
        ((ObjectNode)tree.path("input").path("sessions").get(0).path("events").get(0).path("payload")).put("catalogVersion","old");
        assertThat(new AnalysisContentScope(mapper).catalog(mapper.convertValue(tree,BehaviorAnalysisInputResponse.class)).isEmpty()).isTrue();
    }
    @Test void 표_변환과_별칭은_원본_입력을_건드리지_않는다() {
        var input=fixture(true);String before=mapper.writeValueAsString(input);
        var factory=new AiBehaviorAnalysisPromptFactory(mapper);
        String wire=new AnalysisReferences(mapper,input).encode(factory.observationPrompt(input,input));
        assertThat(wire).contains("OBSERVE:").doesNotContain("\"practicePlan\":");
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
    }
    private BehaviorAnalysisInputResponse fixture(boolean snapshot) {
        var now=Instant.parse("2026-09-05T00:00:00Z");var dataset=UUID.randomUUID();
        ObjectNode event=mapper.createObjectNode();event.put("behaviorLogId",UUID.randomUUID().toString());event.put("sequence",1);
        event.put("elapsedFromSessionStartMs",0);
        var payload=event.putObject("payload");payload.put("type","SHOPPING");payload.put("catalogVersion",MarketQuestCatalog.VERSION);
        payload.put("itemId","milk");
        var content=payload.putObject("marketContent");content.put("sceneRef","scene");
        if(snapshot) {
            var scene=content.putObject("sceneSnapshot");
            scene.putObject("mission").putArray("objectives").addObject().put("productId","milk").putArray("acceptedProductIds").add("apple");
            scene.putArray("products").addObject().put("id","milk");scene.withArray("products").addObject().put("id","banana");
            scene.putArray("slots").addObject().put("productId","milk");scene.withArray("slots").addObject().put("productId","banana");
        }
        var data=new BehaviorAnalysisInput("test",dataset,now,new BehaviorAnalysisInput.AnalysisWindow(now,now),"anonymous",1,1,
                List.of(new BehaviorAnalysisInput.SessionTimeline(UUID.randomUUID(),now,now,null,List.of(mapper.convertValue(event,BehaviorAnalysisInput.EventTimeline.class)))));
        return new BehaviorAnalysisInputResponse(dataset,"test",now,1,1,data);
    }
}
