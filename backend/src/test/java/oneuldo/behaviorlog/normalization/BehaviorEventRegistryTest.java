package oneuldo.behaviorlog.normalization;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.List;
import oneuldo.behaviorlog.normalization.domain.BehaviorDomain;
import oneuldo.behaviorlog.normalization.registry.BehaviorEventRegistry;
import oneuldo.behaviorlog.normalization.registry.EvidencePolicy;
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
        var missing = registry.find("SHOP.ITEM_MISSING").orElseThrow();
        assertEquals(java.util.Set.of("itemId", "requiredQuantity", "selectedQuantity"),
                missing.requiredPayloadFields());
        assertEquals(oneuldo.behaviorlog.normalization.domain.ErrorType.OMISSION,
                missing.defaultErrorType());

        var unknown = registry.find("SHOP.NOT_REGISTERED");
        assertFalse(unknown.isPresent());
    }

    @Test
    void 프론트가_수집하는_장보기_미세행동을_모두_정의한다() {
        List<String> eventCodes = List.of(
                "SHOP.SESSION_STARTED", "SHOP.MISSION_PRESENTED", "SHOP.BRIEFING_ADVANCED",
                "SHOP.ITEM_SEARCH_STARTED", "SHOP.MOVEMENT_SEGMENT_SUMMARIZED",
                "SHOP.MOVEMENT_SAMPLED", "SHOP.MOVEMENT_STOPPED", "SHOP.MOVEMENT_BLOCKED",
                "SHOP.MOVEMENT_BLOCKED_REPEATEDLY", "SHOP.SHELF_PROXIMITY_ENTERED",
                "SHOP.SHELF_PROXIMITY_EXITED", "SHOP.CHECKOUT_PROXIMITY_ENTERED",
                "SHOP.CHECKOUT_PROXIMITY_EXITED", "SHOP.SHELF_REVISITED",
                "SHOP.TARGET_SHELF_REVISITED", "SHOP.TARGET_SHELF_APPROACHED",
                "SHOP.WRONG_AISLE_ENTERED", "SHOP.TARGET_PASSED", "SHOP.OFF_TARGET_DWELL",
                "SHOP.ROUTE_LOOP_DETECTED", "SHOP.SHELF_OPENED", "SHOP.SHELF_CLOSED",
                "SHOP.NON_TARGET_SHELF_OPENED", "SHOP.TARGET_SHELF_LEFT_WITHOUT_SELECTION",
                "SHOP.CART_OPENED", "SHOP.CART_CLOSED", "SHOP.QUANTITY_CHANGED",
                "SHOP.ITEM_SELECTED", "SHOP.WRONG_ITEM_SELECTED", "SHOP.QUANTITY_MATCHED",
                "SHOP.QUANTITY_OVERSHOT", "SHOP.CHECKOUT_ENTERED",
                "SHOP.EARLY_CHECKOUT_APPROACH", "SHOP.CHECKOUT_SUBMITTED",
                "SHOP.CHECKOUT_CORRECTION_STARTED", "SHOP.APP_BACKGROUNDED",
                "SHOP.APP_FOREGROUNDED", "SHOP.IDLE_STARTED", "SHOP.IDLE_ENDED",
                "SHOP.SESSION_COMPLETED", "COMMON.ABORT"
        );

        eventCodes.forEach(eventCode -> assertTrue(registry.find(eventCode).isPresent(), eventCode));
    }

    @Test
    void 고빈도_이동_이벤트는_프로파일의_주요_근거가_아닌_문맥으로_분류한다() {
        assertEquals(EvidencePolicy.CONTEXT_ONLY,
                registry.find("SHOP.MOVEMENT_SEGMENT_SUMMARIZED").orElseThrow().evidencePolicy());
        assertEquals(EvidencePolicy.PROFILE_EVIDENCE,
                registry.find("SHOP.TARGET_PASSED").orElseThrow().evidencePolicy());
    }
}
