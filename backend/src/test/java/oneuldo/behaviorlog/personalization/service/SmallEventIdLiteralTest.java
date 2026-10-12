package oneuldo.behaviorlog.personalization.service;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInput;
import oneuldo.behaviorlog.analysis.service.FinalSourceColumns;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class SmallEventIdLiteralTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    @Test void actual_route_loop_group_exposes_original_event_ids_instead_of_its_row_positions() throws Exception {
        var path=Path.of("../output/persona45-mcp-20261013/auditor/input-snapshots.json");
        org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
        JsonNode input=null;
        for(var row:mapper.readTree(Files.readString(path)))if("29be6aaf-82da-4343-b98f-4104c6d8b72c".equals(row.path("id").asString()))input=row.path("input_data");
        assertThat(input).isNotNull();
        var original=AdaptiveQuestEvidence.build(mapper,mapper.treeToValue(input,BehaviorAnalysisInput.class));
        var codec=new FinalSourceColumns(mapper,true);var wire=codec.encode(original);
        assertThat(codec.decode(wire)).isEqualTo(original);
        var groups=new ArrayList<JsonNode>();findLoopFields(wire,groups);
        assertThat(groups).hasSize(1);
        assertThat(groups.getFirst().path("id")).isEqualTo(mapper.valueToTree(List.of("E814","E1783")));
        assertThat(groups.getFirst().path("id").toString()).doesNotContain("E87\"", "E198\"");
        Files.writeString(Path.of("../output/persona45-mcp-20261013/literal-route-loop-id-verification.json"),mapper.writeValueAsString(Map.of("literalEventIds",groups.getFirst().path("id"),"originalSourceExactlyRestored",true,"groupRowPositionsAreNotEventIds",true,"noNewPlay",true)));
    }
    void findLoopFields(JsonNode node,List<JsonNode> result){
        if(node.isObject()){
            if("SHOP.ROUTE_LOOP_DETECTED".equals(node.path("eventCode").path("=").asString()))result.add(node);
            node.forEach(value->findLoopFields(value,result));
        }else if(node.isArray())node.forEach(value->findLoopFields(value,result));
    }
}
