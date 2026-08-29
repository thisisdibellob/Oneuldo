package oneuldo.behaviorlog.normalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import oneuldo.behaviorlog.normalization.domain.BehaviorDomain;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry;
import org.junit.jupiter.api.Test;

class BehaviorEventRegistryTest {

    private final BehaviorEventRegistry registry = new BehaviorEventRegistry();

    @Test
    void 모든_행동_영역의_대표_이벤트를_명시적으로_정의한다() {
        Map<String, BehaviorDomain> representatives = Map.of(
                "SHOP.ITEM_SELECTED", BehaviorDomain.SHOPPING,
                "COOK.STEP_OMITTED", BehaviorDomain.COOKING,
                "HYGIENE.STEP_COMPLETED", BehaviorDomain.HYGIENE_CLOTHING,
                "LAUNDRY.ITEM_CLASSIFIED", BehaviorDomain.HOUSEHOLD,
                "ATM.AMOUNT_SELECTED", BehaviorDomain.KIOSK_ATM,
                "SAFETY.HAZARD_RECHECKED", BehaviorDomain.SAFETY,
                "WORK.TASK_STARTED", BehaviorDomain.WORK,
                "COMMON.RETRY", BehaviorDomain.PASSIVE_PLAY
        );

        representatives.forEach((eventCode, domain) ->
                assertEquals(domain, registry.find(eventCode).orElseThrow().domain()));
    }

    @Test
    void 필수_필드와_측정값은_eventCode_정의에_포함된다() {
        var quantity = registry.find("SHOP.QUANTITY_CHANGED").orElseThrow();
        assertEquals(java.util.Set.of("requiredQuantity", "selectedQuantity"),
                quantity.requiredPayloadFields());
        assertTrue(quantity.measurementRules().stream()
                .anyMatch(rule -> rule.metricCode().equals("selectedQuantity")
                        && rule.targetSourcePath().equals("payload.requiredQuantity")));

        var unknown = registry.find("SHOP.NOT_REGISTERED");
        assertFalse(unknown.isPresent());
    }
}
