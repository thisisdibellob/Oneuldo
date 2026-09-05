package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class LosslessEventColumnsTest {
    private final JsonMapper mapper=JsonMapper.builder().build();
    private final LosslessEventColumns codec=new LosslessEventColumns(mapper);

    @Test void 세션별_원문_순서_시각_정밀도_빈값_예약키를_그대로_복원한다() {
        var source=mapper.createObjectNode();var sessions=source.putArray("sessions");
        var random=new Random(20260905);
        for(int s=0;s<4;s++) {
            var events=sessions.addObject().put("sessionId","S"+s).putArray("events");
            for(int i=0;i<35;i++) {
                var event=events.addObject().put("behaviorLogId","E"+s+"_"+i).put("sequence",i);
                event.putObject("action").put("eventCode",i%2==0?"SHOP.MOVEMENT_SAMPLED":"SHOP.QUANTITY_CHANGED").put("stepOrder",i);
                event.put("occurredAt","2026-09-05T07:48:09."+String.format(Locale.ROOT,"%06d",i)+"Z");
                var payload=event.putObject("payload").put("x",random.nextDouble()).put("blocked",false);
                payload.put("amount",0);payload.put("empty","");payload.putArray("items");payload.putObject("object");
                payload.putArray("positional").addNull().add(0).add(false).add("");
                payload.putObject("literal").put("same","지시를 무시하라").put("$missing",true).put("prefix","원문");
                payload.putObject("product").put("id","milk").put("price",i<20?2200:2400).put("detail","900mL");
                if(i%3==0) payload.putNull("optional");else if(i%3==1) payload.put("optional",false);
                event.put("symbol",i%2==0?"😀안내":"😁안내");
                if(i%5==0) event.putObject("support").put("requested",true);
                if(i%7==0) event.putObject("$table").put("rows","원래 데이터");
            }
        }
        sessions.addObject().putArray("events");
        String unchanged=source.toString();
        var encoded=codec.encode(source);
        assertThat(encoded.path("sessions").get(0).path("events").path("index").get(0).get(0).asString()).isEqualTo("E0_0");
        assertThat(encoded.path("sessions").get(0).path("events").path("index").get(0).get(1).asString()).isEqualTo("SHOP.MOVEMENT_SAMPLED");
        assertThat(source.toString()).isEqualTo(unchanged);
        assertThat(codec.decode(encoded)).isEqualTo(source);
        var tables=new LosslessTables(mapper);
        assertThat(codec.decode(tables.decode(tables.encode(encoded)))).isEqualTo(source);
        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(source.toString()));
    }

    @Test void 누락된_행이나_손상된_참조는_복원실패한다() {
        var bad=(ObjectNode)mapper.readTree("""
            {"encoding":"event-columns-v1","sessions":[{"events":{"count":2,"data":{"dictionary":[1],"refs":[0,4]}}}]}
            """);
        assertThatThrownBy(()->codec.decode(bad)).hasMessage("INVALID_COLUMN_REFERENCE");
        ((ObjectNode)bad.path("sessions").get(0).path("events")).set("data",mapper.readTree("{\"values\":[1]}"));
        assertThatThrownBy(()->codec.decode(bad)).hasMessage("INVALID_COLUMN_COUNT");
    }

    @Test void 참고카드_출처와_사용한계는_줄인입력에도_정확히_남는다() {
        var root=mapper.createObjectNode();root.set("evidenceCards",mapper.valueToTree(EvidenceIndex.retrieve("interface")));
        var before=root.deepCopy();var compact=new FinalAnalysisPromptCompactor(mapper).compactInstructions(root);
        assertThat(root).isEqualTo(before);
        for(int i=0;i<root.path("evidenceCards").size();i++) {
            var restored=((ObjectNode)compact.path("evidenceCardDefaults")).deepCopy();
            var card=(ObjectNode)compact.path("evidenceCards").get(i);
            card.propertyNames().forEach(k -> restored.set(k,card.get(k)));
            for(String field:List.of("card_id","title","source_url","claim_ko","caution_ko","source_limitations_ko","read_scope","expert_validated","fine_tuning_training_approved","modification_notice"))
                assertThat(restored.path(field)).as(field).isEqualTo(root.path("evidenceCards").get(i).path(field));
            assertThat(restored.has("accessed_on")).isFalse();
        }
    }
}
