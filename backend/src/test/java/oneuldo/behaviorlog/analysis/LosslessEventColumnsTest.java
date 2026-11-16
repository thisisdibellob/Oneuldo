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

    @Test void 연속된_사건번호와_순번은_양끝만_보내고_그대로_복원한다() {
        var source=mapper.createObjectNode();var events=source.putArray("sessions").addObject().put("sessionId","S1").putArray("events");
        for(int i=0;i<40;i++) {
            var event=events.addObject().put("behaviorLogId","E"+(481+i)).put("sequence",5001L+i);
            event.putObject("action").put("eventCode",i%4==0?"SHOP.QUANTITY_CHANGED":"SHOP.MOVEMENT_SAMPLED");
            event.putObject("payload").put("x",700+i).put("y",1300-i);
        }
        var encoded=codec.encode(source);var run=encoded.path("sessions").get(0).path("events");
        assertThat(run.has("index")).isFalse();
        assertThat(run.path("idRun")).isEqualTo(mapper.readTree("[\"E481\",\"E520\"]"));
        assertThat(run.path("sequenceRun").toString()).isEqualTo("[5001,5040]");
        assertThat(run.path("codes").size()).isEqualTo(40);
        assertThat(encoded.path("encodingRules").asString()).contains("idRun:[첫ID,끝ID]");
        assertThat(mapper.readTree(codec.decode(mapper.readTree(encoded.toString())).toString())).isEqualTo(mapper.readTree(source.toString()));
        assertThat(QwenTokenCounter.count(encoded.toString())).isLessThan(QwenTokenCounter.count(source.toString()));

        // A gap is not a run: every ID stays literal beside its action.
        ((ObjectNode)events.get(7)).put("behaviorLogId","E999").put("sequence",9999L);
        var literal=codec.encode(source).path("sessions").get(0).path("events");
        assertThat(literal.has("idRun")).isFalse();assertThat(literal.has("sequenceRun")).isFalse();
        assertThat(literal.path("index").get(7).get(0).asString()).isEqualTo("E999");
        assertThat(mapper.readTree(codec.decode(codec.encode(source)).toString())).isEqualTo(mapper.readTree(source.toString()));

        // A run whose ends do not match the row count cannot be restored.
        ((ObjectNode)run).set("idRun",mapper.readTree("[\"E481\",\"E519\"]"));
        assertThatThrownBy(()->codec.decode(encoded)).hasMessage("INVALID_EVENT_ID_RUN");
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
