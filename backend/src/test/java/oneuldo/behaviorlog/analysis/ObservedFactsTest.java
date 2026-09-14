package oneuldo.behaviorlog.analysis;

import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.ObservedFacts;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;

class ObservedFactsTest {
    final MovementProjectionTest f=new MovementProjectionTest();
    @Test void derivesMillisecondsAndSnapshotShelfWithoutMutatingSource() {
        var root=f.fixture();
        var events=root.path("input").path("sessions").get(0).path("events");
        ((ObjectNode)events.get(0)).put("elapsedFromSessionStartMs",1000);
        ((ObjectNode)events.get(2)).put("elapsedFromSessionStartMs",1559);
        ((ObjectNode)events.get(0).path("action")).put("eventCode","SHOP.SHELF_CLOSED");
        ((ObjectNode)events.get(2).path("action")).put("eventCode","SHOP.ITEM_SEARCH_STARTED");
        var scene=((ObjectNode)events.get(0).path("payload").path("marketContent")).putObject("sceneSnapshot");
        scene.putObject("mission").putArray("objectives").addObject().put("productId","water");
        scene.putArray("products").addObject().put("id","water").put("categoryId","drink");
        var source=f.input(root);String before=f.mapper.writeValueAsString(source);
        var result=new ObservedFacts(f.mapper).build(source,source).path("sessions").get(0);
        assertThat(result.path("intervals").get(0).get(2).asLong()).isEqualTo(559);
        assertThat(result.path("intervals").get(0).get(3).asDouble()).isEqualTo(0.559);
        assertThat(result.path("scenes").get(0).path("products").get(0).get(1).asString()).isEqualTo("drink");
        assertThat(f.mapper.writeValueAsString(source)).isEqualTo(before);
    }
    @Test void backwardsTimesAreNotTurnedIntoDurationsAndMissingSceneIsNotInvented() {
        var root=f.fixture();var events=root.path("input").path("sessions").get(0).path("events");
        ((ObjectNode)events.get(0)).put("elapsedFromSessionStartMs",1000);
        ((ObjectNode)events.get(0).path("action")).put("eventCode","SHOP.SHELF_CLOSED");
        ((ObjectNode)events.get(1).path("action")).put("eventCode","SHOP.ITEM_SEARCH_STARTED");
        var source=f.input(root);var result=new ObservedFacts(f.mapper).build(source,source).path("sessions").get(0);
        assertThat(result.path("intervals").isEmpty()).isTrue();
        assertThat(result.path("scenes").isEmpty()).isTrue();
    }
}
