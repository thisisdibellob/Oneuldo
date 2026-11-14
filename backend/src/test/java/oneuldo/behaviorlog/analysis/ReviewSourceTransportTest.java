package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.*;
import static org.assertj.core.api.Assertions.*;

class ReviewSourceTransportTest {
    final JsonMapper m=JsonMapper.builder().build();
    @Test void reduces_repeated_review_inputs_without_changing_paths_values_order_or_quotes(){
        var root=m.createObjectNode();root.putObject("candidate").put("summary","원문 E7, 수량 0, 좌표 123.456789012345");
        root.putObject("outputSchema").put("verdict","VALID|REPAIR");
        var rows=root.putObject("sourceFacts").putArray("events");
        for(int i=1;i<=120;i++)rows.addObject().put("eventId","E"+i).put("x",123.456789012345).put("y",0).putNull("missingReport").put("flag",false).put("owner","PERSONA_ACTOR").put("type","SHOP.CART_OPENED");
        String packed=ReviewSourceTransport.encode(m,root);
        assertThat(new FinalSourceEncoding(m).decode(m.readTree(packed))).isEqualTo(root);
        assertThat(m.readTree(packed).path("candidate")).isEqualTo(root.path("candidate"));
        assertThat(m.readTree(packed).path("outputSchema")).isEqualTo(root.path("outputSchema"));
        assertThat(QwenTokenCounter.count(packed)).isLessThan(QwenTokenCounter.count(root.toString()));
    }
    @Test void tiny_inputs_keep_the_cheapest_complete_representation(){
        var root=m.createObjectNode().put("scope","자료 미확인");
        assertThat(ReviewSourceTransport.encode(m,root)).isEqualTo(root.toString());
    }
}
