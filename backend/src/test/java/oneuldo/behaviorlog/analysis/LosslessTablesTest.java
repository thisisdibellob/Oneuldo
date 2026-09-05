package oneuldo.behaviorlog.analysis;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.LosslessTables;
class LosslessTablesTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    @Test void 표는_순서와_누락_null_예약키_공통값을_복원한다() {
        var input = mapper.readTree("""
            [{"commonLongProperty":"constant","value":null,"x":0,"data":{"$missing":true}},
             {"commonLongProperty":"constant","x":false,"data":{"$table":["raw"]}},
             {"commonLongProperty":"constant","x":[],"data":{"$literal":{"a":1}}},
             {"commonLongProperty":"constant","x":{},"data":[]},
             {"commonLongProperty":"constant","x":"","data":[null]}]
            """);
        var codec = new LosslessTables(mapper);
        assertThat(codec.decode(codec.encode(input))).isEqualTo(input);
    }
}
