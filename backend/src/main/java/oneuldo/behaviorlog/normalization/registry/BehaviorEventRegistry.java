package oneuldo.behaviorlog.normalization.registry;

import static oneuldo.behaviorlog.normalization.domain.CanonicalActionType.*;
import static oneuldo.behaviorlog.normalization.domain.ErrorType.*;
import static oneuldo.behaviorlog.normalization.domain.ObservedOutcome.*;
import static oneuldo.behaviorlog.normalization.domain.MeasurementUnit.*;
import static oneuldo.behaviorlog.normalization.domain.ValueSemantics.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import oneuldo.behaviorlog.domain.type.BehaviorPayloadType;
import oneuldo.behaviorlog.normalization.domain.BehaviorDomain;
import oneuldo.behaviorlog.normalization.domain.CanonicalActionType;
import oneuldo.behaviorlog.normalization.domain.ErrorType;
import oneuldo.behaviorlog.normalization.domain.ObservedOutcome;
import oneuldo.behaviorlog.normalization.domain.EvidenceRole;
import org.springframework.stereotype.Component;

@Component
public class BehaviorEventRegistry {

    public static final String REGISTRY_VERSION = "behavior-event-registry-v1";
    public static final String MEASUREMENT_RULE_VERSION = "behavior-measurement-rules-v1";

    private final Map<String, BehaviorEventDefinition> definitions;

    public BehaviorEventRegistry() {
        Map<String, BehaviorEventDefinition> registry = new HashMap<>();
        shopping(registry);
        cooking(registry);
        hygiene(registry);
        household(registry);
        kioskAtm(registry);
        safety(registry);
        work(registry);
        common(registry);
        requiredFields(registry);
        evidenceRules(registry);
        measurementRules(registry);
        validateDefinitions(registry);
        definitions = Map.copyOf(registry);
    }

    public Optional<BehaviorEventDefinition> find(String eventCode) {
        return Optional.ofNullable(definitions.get(eventCode));
    }

    private void shopping(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.SHOPPING;
        addContext(map, p, BehaviorDomain.SHOPPING, START, NEUTRAL, NONE,
                "EXECUTIVE_FUNCTION", "SHOP.SESSION_STARTED");
        addContext(map, p, BehaviorDomain.SHOPPING, START, NEUTRAL, NONE,
                "EXECUTIVE_FUNCTION", "SHOP.TIME_LIMIT_STARTED");
        addContext(map, p, BehaviorDomain.SHOPPING, COMPLETE_TASK, INCOMPLETE, NONE,
                "EXECUTIVE_FUNCTION", "SHOP.TIME_LIMIT_EXPIRED");
        addContext(map, p, BehaviorDomain.SHOPPING, VIEW_INSTRUCTION, NEUTRAL, NONE,
                "EXECUTIVE_FUNCTION", "SHOP.MISSION_PRESENTED", "SHOP.BRIEFING_ADVANCED");
        add(map, p, BehaviorDomain.SHOPPING, VIEW_INSTRUCTION, NEUTRAL, NONE, false, "EXECUTIVE_FUNCTION", "SHOP.LIST_OPENED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, null, NONE, false, "LANGUAGE_COMPREHENSION", "SHOP.ITEM_SELECTED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, FAILURE, WRONG_SELECTION, false, "LANGUAGE_COMPREHENSION", "SHOP.WRONG_ITEM_SELECTED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, FAILURE, OMISSION, false, "LANGUAGE_COMPREHENSION", "SHOP.ITEM_MISSING");
        add(map, p, BehaviorDomain.SHOPPING, START, NEUTRAL, NONE, false, "SPATIAL_NAVIGATION", "SHOP.ITEM_SEARCH_STARTED");
        add(map, p, BehaviorDomain.SHOPPING, NAVIGATE, FAILURE, NAVIGATION_ERROR, false, "SPATIAL_NAVIGATION", "SHOP.WRONG_AISLE_ENTERED", "SHOP.TARGET_PASSED");
        addContext(map, p, BehaviorDomain.SHOPPING, NAVIGATE, NEUTRAL, NONE,
                "SPATIAL_NAVIGATION", "SHOP.MOVEMENT_SEGMENT_SUMMARIZED",
                "SHOP.SHELF_PROXIMITY_ENTERED", "SHOP.SHELF_PROXIMITY_EXITED",
                "SHOP.CHECKOUT_PROXIMITY_ENTERED", "SHOP.CHECKOUT_PROXIMITY_EXITED",
                "SHOP.TARGET_SHELF_APPROACHED", "SHOP.SHELF_REVISITED",
                "SHOP.MOVEMENT_BLOCKED", "SHOP.MOVEMENT_UNBLOCKED", "SHOP.MOVEMENT_SAMPLED");
        addContext(map, p, BehaviorDomain.SHOPPING, WAIT, NEUTRAL, NONE,
                "SELF_REGULATION", "SHOP.MOVEMENT_STOPPED", "SHOP.IDLE_STARTED",
                "SHOP.IDLE_ENDED", "SHOP.APP_BACKGROUNDED", "SHOP.APP_FOREGROUNDED");
        add(map, p, BehaviorDomain.SHOPPING, NAVIGATE, NEUTRAL, REPETITION, false,
                "SPATIAL_NAVIGATION", "SHOP.TARGET_SHELF_REVISITED", "SHOP.ROUTE_LOOP_DETECTED");
        add(map, p, BehaviorDomain.SHOPPING, WAIT, INCOMPLETE, NAVIGATION_ERROR, false,
                "SUSTAINED_ATTENTION", "SHOP.OFF_TARGET_DWELL");
        add(map, p, BehaviorDomain.SHOPPING, NAVIGATE, FAILURE, NAVIGATION_ERROR, false,
                "SPATIAL_NAVIGATION", "SHOP.MOVEMENT_BLOCKED_REPEATEDLY");
        addContext(map, p, BehaviorDomain.SHOPPING, CHECK, NEUTRAL, NONE,
                "EXECUTIVE_FUNCTION", "SHOP.SHELF_OPENED", "SHOP.SHELF_CLOSED",
                "SHOP.NON_TARGET_SHELF_OPENED", "SHOP.CART_OPENED", "SHOP.CART_CLOSED");
        add(map, p, BehaviorDomain.SHOPPING, COMPLETE_STEP, INCOMPLETE, OMISSION, false,
                "EXECUTIVE_FUNCTION", "SHOP.TARGET_SHELF_LEFT_WITHOUT_SELECTION");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, null, QUANTITY_ERROR, false, "NUMERACY", "SHOP.QUANTITY_CHANGED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, SUCCESS, NONE, false,
                "NUMERACY", "SHOP.QUANTITY_MATCHED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, FAILURE, QUANTITY_ERROR, false,
                "NUMERACY", "SHOP.QUANTITY_OVERSHOT");
        addContext(map, p, BehaviorDomain.SHOPPING, NAVIGATE, NEUTRAL, NONE,
                "EXECUTIVE_FUNCTION", "SHOP.CHECKOUT_ENTERED");
        add(map, p, BehaviorDomain.SHOPPING, NAVIGATE, INCOMPLETE, OMISSION, false,
                "EXECUTIVE_FUNCTION", "SHOP.EARLY_CHECKOUT_APPROACH");
        add(map, p, BehaviorDomain.SHOPPING, COMPLETE_TASK, null, NONE, false,
                "DAILY_LIVING", "SHOP.CHECKOUT_SUBMITTED");
        add(map, p, BehaviorDomain.SHOPPING, SELF_CORRECT, SUCCESS, NONE, false,
                "ERROR_RECOVERY", "SHOP.CHECKOUT_CORRECTION_STARTED");
        add(map, p, BehaviorDomain.SHOPPING, COMPLETE_TASK, SUCCESS, NONE, false,
                "DAILY_LIVING", "SHOP.SESSION_COMPLETED");
        add(map, p, BehaviorDomain.SHOPPING, COMPARE, null, NONE, false, "MONEY_MANAGEMENT", "SHOP.PRICE_CHECKED");
        add(map, p, BehaviorDomain.SHOPPING, COMPARE, FAILURE, QUANTITY_ERROR, false, "MONEY_MANAGEMENT", "SHOP.BUDGET_EXCEEDED");
        add(map, p, BehaviorDomain.SHOPPING, CHECK, SUCCESS, NONE, false, "PROBLEM_SOLVING", "SHOP.OUT_OF_STOCK_DETECTED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, SUCCESS, NONE, false, "PROBLEM_SOLVING", "SHOP.SUBSTITUTE_SELECTED");
        add(map, p, BehaviorDomain.SHOPPING, REQUEST_HELP, NEUTRAL, NONE, false, "HELP_SEEKING", "SHOP.STAFF_HELP_REQUESTED");
        addContext(map, p, BehaviorDomain.SHOPPING, VIEW_INSTRUCTION, NEUTRAL, NONE, "EXECUTIVE_FUNCTION", "SHOP.GENERAL_HELP_OPENED");
        addContext(map, p, BehaviorDomain.SHOPPING, VIEW_INSTRUCTION, NEUTRAL, NONE, "EXECUTIVE_FUNCTION",
                "SHOP.SHOPPING_LIST_OPENED", "SHOP.SHOPPING_LIST_CLOSED");
        addContext(map, p, BehaviorDomain.SHOPPING, CHECK, NEUTRAL, NONE, "PROBLEM_SOLVING", "SHOP.RUNTIME_ACTION_RECORDED");
        add(map, p, BehaviorDomain.SHOPPING, SELECT, null, NONE, true, "MONEY_MANAGEMENT", "PAYMENT.METHOD_SELECTED");
        add(map, p, BehaviorDomain.SHOPPING, COMPLETE_TASK, FAILURE, UNKNOWN, true, "MONEY_MANAGEMENT", "PAYMENT.ERROR");
        add(map, p, BehaviorDomain.SHOPPING, COMPLETE_TASK, SUCCESS, NONE, true, "MONEY_MANAGEMENT", "PAYMENT.COMPLETED");
        add(map, p, BehaviorDomain.SHOPPING, CHECK, null, NONE, false, "MONEY_MANAGEMENT", "RECEIPT.CHECKED");
    }

    private void cooking(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.COOKING;
        add(map, p, BehaviorDomain.COOKING, VIEW_INSTRUCTION, NEUTRAL, NONE, false, "LANGUAGE_COMPREHENSION", "COOK.RECIPE_OPENED");
        add(map, p, BehaviorDomain.COOKING, SELECT, null, NONE, false, "EXECUTIVE_FUNCTION", "COOK.INGREDIENT_SELECTED", "COOK.TOOL_SELECTED");
        add(map, p, BehaviorDomain.COOKING, SELECT, FAILURE, WRONG_SELECTION, false, "EXECUTIVE_FUNCTION", "COOK.WRONG_INGREDIENT");
        add(map, p, BehaviorDomain.COOKING, START, NEUTRAL, NONE, false, "EXECUTIVE_FUNCTION", "COOK.STEP_STARTED");
        add(map, p, BehaviorDomain.COOKING, COMPLETE_STEP, FAILURE, OMISSION, false, "EXECUTIVE_FUNCTION", "COOK.STEP_OMITTED");
        add(map, p, BehaviorDomain.COOKING, SEQUENCE, FAILURE, SEQUENCE_ERROR, false, "EXECUTIVE_FUNCTION", "COOK.SEQUENCE_ERROR");
        add(map, p, BehaviorDomain.COOKING, SELECT, FAILURE, QUANTITY_ERROR, false, "NUMERACY", "COOK.QUANTITY_ERROR");
        add(map, p, BehaviorDomain.COOKING, SELECT, null, NONE, false, "TIME_MANAGEMENT", "COOK.TIMER_SET");
        add(map, p, BehaviorDomain.COOKING, WAIT, FAILURE, TIME_ERROR, true, "TIME_MANAGEMENT", "COOK.TIMER_MISSED");
        add(map, p, BehaviorDomain.COOKING, CHECK, SUCCESS, NONE, false, "PROBLEM_SOLVING", "COOK.PROBLEM_DETECTED", "COOK.PROBLEM_RESOLVED");
        add(map, p, BehaviorDomain.COOKING, START, NEUTRAL, NONE, true, "SAFETY_AWARENESS", "COOK.HEAT_STARTED");
        add(map, p, BehaviorDomain.COOKING, CHECK, FAILURE, SAFETY_ERROR, true, "SAFETY_AWARENESS", "COOK.HEAT_LEFT_ON");
        add(map, p, BehaviorDomain.COOKING, COMPLETE_STEP, SUCCESS, NONE, false, "DAILY_LIVING", "CLEAN.DISH_WASHED", "CLEAN.SURFACE_CLEANED", "CLEAN.WASTE_SORTED");
    }

    private void hygiene(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.HYGIENE_CLOTHING;
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, START, NEUTRAL, NONE, false, "DAILY_LIVING", "HYGIENE.TASK_STARTED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, SELECT, null, NONE, false, "DAILY_LIVING", "HYGIENE.TOOL_SELECTED", "CLOTHING.ITEM_SELECTED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, SELECT, FAILURE, WRONG_SELECTION, false, "DAILY_LIVING", "HYGIENE.WRONG_TOOL", "CLOTHING.CONTEXT_MISMATCH");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, COMPLETE_STEP, SUCCESS, NONE, false, "DAILY_LIVING", "HYGIENE.STEP_COMPLETED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, COMPLETE_STEP, FAILURE, OMISSION, false, "EXECUTIVE_FUNCTION", "HYGIENE.STEP_OMITTED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, RETRY, FAILURE, REPETITION, false, "EXECUTIVE_FUNCTION", "HYGIENE.STEP_REPEATED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, SEQUENCE, FAILURE, SEQUENCE_ERROR, false, "EXECUTIVE_FUNCTION", "HYGIENE.SEQUENCE_ERROR");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, COMPLETE_TASK, INCOMPLETE, OMISSION, false, "DAILY_LIVING", "HYGIENE.TASK_ENDED_EARLY");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, CHECK, SUCCESS, NONE, true, "PRIVACY_SAFETY", "PRIVACY.DOOR_CLOSED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, CHECK, NEUTRAL, NONE, false, "CONTEXT_JUDGMENT", "CLOTHING.WEATHER_CHECKED");
        add(map, p, BehaviorDomain.HYGIENE_CLOTHING, REQUEST_HELP, NEUTRAL, NONE, false, "SELF_ADVOCACY", "COMFORT.BREAK_REQUESTED");
    }

    private void household(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.HOUSEHOLD;
        add(map, p, BehaviorDomain.HOUSEHOLD, SELECT, null, NONE, false, "CLASSIFICATION", "LAUNDRY.ITEM_CLASSIFIED", "LAUNDRY.MODE_SELECTED", "CLEAN.TOOL_SELECTED", "WASTE.ITEM_SORTED");
        add(map, p, BehaviorDomain.HOUSEHOLD, SELECT, FAILURE, WRONG_SELECTION, false, "CLASSIFICATION", "LAUNDRY.CLASSIFICATION_ERROR");
        add(map, p, BehaviorDomain.HOUSEHOLD, CHECK, SUCCESS, NONE, false, "DAILY_LIVING", "LAUNDRY.POCKET_CHECKED", "CLEAN.SPILL_DETECTED");
        add(map, p, BehaviorDomain.HOUSEHOLD, SELECT, null, NONE, false, "NUMERACY", "LAUNDRY.DETERGENT_AMOUNT_SELECTED");
        add(map, p, BehaviorDomain.HOUSEHOLD, START, NEUTRAL, NONE, false, "DAILY_LIVING", "LAUNDRY.STARTED");
        add(map, p, BehaviorDomain.HOUSEHOLD, COMPLETE_STEP, FAILURE, OMISSION, false, "DAILY_LIVING", "LAUNDRY.REMOVAL_FORGOTTEN");
        add(map, p, BehaviorDomain.HOUSEHOLD, SELECT, null, NONE, false, "SPATIAL_NAVIGATION", "ORGANIZE.ITEM_PLACED");
        add(map, p, BehaviorDomain.HOUSEHOLD, COMPLETE_STEP, SUCCESS, NONE, false, "DAILY_LIVING", "CLEAN.AREA_COMPLETED");
        add(map, p, BehaviorDomain.HOUSEHOLD, CHECK, SUCCESS, NONE, true, "HOME_SAFETY", "HOME.APPLIANCE_TURNED_OFF", "HOME.DOOR_LOCKED");
    }

    private void kioskAtm(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.KIOSK_ATM;
        add(map, p, BehaviorDomain.KIOSK_ATM, START, NEUTRAL, NONE, false, "DEVICE_USE", "KIOSK.SESSION_STARTED");
        add(map, p, BehaviorDomain.KIOSK_ATM, SELECT, NEUTRAL, NONE, false, "ACCESSIBILITY_USE", "KIOSK.ACCESSIBILITY_MODE_SELECTED");
        add(map, p, BehaviorDomain.KIOSK_ATM, NAVIGATE, NEUTRAL, NONE, false, "DEVICE_USE", "KIOSK.MENU_OPENED", "KIOSK.BACK_USED");
        add(map, p, BehaviorDomain.KIOSK_ATM, NAVIGATE, FAILURE, NAVIGATION_ERROR, false, "DEVICE_USE", "KIOSK.WRONG_MENU_SELECTED");
        add(map, p, BehaviorDomain.KIOSK_ATM, WAIT, FAILURE, TIME_ERROR, false, "DEVICE_USE", "KIOSK.TIMEOUT");
        add(map, p, BehaviorDomain.KIOSK_ATM, SELECT, null, NONE, false, "DEVICE_USE", "KIOSK.ITEM_SELECTED", "KIOSK.QUANTITY_SELECTED", "ATM.AMOUNT_SELECTED", "PUBLIC.COUNTER_SELECTED");
        add(map, p, BehaviorDomain.KIOSK_ATM, COMPARE, FAILURE, QUANTITY_ERROR, false, "MONEY_MANAGEMENT", "KIOSK.BUDGET_EXCEEDED");
        add(map, p, BehaviorDomain.KIOSK_ATM, COMPLETE_TASK, FAILURE, UNKNOWN, false, "ERROR_RECOVERY", "ATM.TRANSACTION_ERROR");
        add(map, p, BehaviorDomain.KIOSK_ATM, WAIT, SUCCESS, NONE, false, "PUBLIC_SERVICE_USE", "PUBLIC.TICKET_TAKEN");
        add(map, p, BehaviorDomain.KIOSK_ATM, SEQUENCE, SUCCESS, NONE, true, "FINANCIAL_SAFETY", "ATM.CARD_INSERTED", "ATM.PIN_PRIVACY_CHECKED");
        add(map, p, BehaviorDomain.KIOSK_ATM, COMPLETE_TASK, SUCCESS, NONE, false, "DEVICE_USE", "ATM.RECEIPT_COLLECTED", "ATM.CARD_RETRIEVED");
    }

    private void safety(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.SAFETY;
        add(map, p, BehaviorDomain.SAFETY, CHECK, SUCCESS, NONE, true, "SAFETY_AWARENESS", "SAFETY.SIGNAL_CHECKED", "SAFETY.VEHICLE_CHECKED", "SAFETY.HAZARD_RECHECKED");
        add(map, p, BehaviorDomain.SAFETY, START, null, NONE, true, "ROAD_SAFETY", "SAFETY.CROSSING_STARTED");
        add(map, p, BehaviorDomain.SAFETY, SELECT, FAILURE, SAFETY_ERROR, true, "ROAD_SAFETY", "SAFETY.UNSAFE_GAP_SELECTED");
        add(map, p, BehaviorDomain.SAFETY, ABORT, SUCCESS, NONE, true, "ROAD_SAFETY", "SAFETY.CROSSING_CANCELLED");
        add(map, p, BehaviorDomain.SAFETY, CHECK, SUCCESS, NONE, true, "EMERGENCY_RESPONSE", "FIRE.ALARM_DETECTED");
        add(map, p, BehaviorDomain.SAFETY, SELECT, null, NONE, true, "EMERGENCY_RESPONSE", "FIRE.EXIT_SELECTED", "LOST.HELPER_SELECTED", "EMERGENCY.CONTACT_SELECTED");
        add(map, p, BehaviorDomain.SAFETY, SELECT, FAILURE, SAFETY_ERROR, true, "EMERGENCY_RESPONSE", "FIRE.ELEVATOR_ATTEMPTED");
        add(map, p, BehaviorDomain.SAFETY, REQUEST_HELP, SUCCESS, NONE, true, "HELP_SEEKING", "LOST.HELP_REQUESTED");
        add(map, p, BehaviorDomain.SAFETY, CHECK, NEUTRAL, NONE, true, "PRIVACY_SAFETY", "PRIVACY.INFORMATION_REQUEST_RECEIVED");
        add(map, p, BehaviorDomain.SAFETY, SELECT, FAILURE, SAFETY_ERROR, true, "PRIVACY_SAFETY", "PRIVACY.INFORMATION_DISCLOSED");
        add(map, p, BehaviorDomain.SAFETY, SELECT, SUCCESS, NONE, true, "PRIVACY_SAFETY", "PRIVACY.REQUEST_REFUSED");
        add(map, p, BehaviorDomain.SAFETY, COMPLETE_TASK, SUCCESS, NONE, true, "EMERGENCY_COMMUNICATION", "EMERGENCY.MESSAGE_COMPLETED");
    }

    private void work(Map<String, BehaviorEventDefinition> map) {
        var p = BehaviorPayloadType.WORK;
        add(map, p, BehaviorDomain.WORK, START, SUCCESS, NONE, false, "WORK_ROUTINE", "WORK.CLOCK_IN", "WORK.TASK_STARTED");
        add(map, p, BehaviorDomain.WORK, COMPLETE_TASK, SUCCESS, NONE, false, "WORK_ROUTINE", "WORK.CLOCK_OUT");
        add(map, p, BehaviorDomain.WORK, VIEW_INSTRUCTION, NEUTRAL, NONE, false, "INSTRUCTION_COMPREHENSION", "WORK.INSTRUCTION_VIEWED");
        add(map, p, BehaviorDomain.WORK, SELECT, null, NONE, false, "WORK_ACCURACY", "WORK.ITEM_CLASSIFIED", "WORK.QUANTITY_COMPLETED");
        add(map, p, BehaviorDomain.WORK, SEQUENCE, FAILURE, SEQUENCE_ERROR, false, "WORK_ACCURACY", "WORK.SEQUENCE_ERROR");
        add(map, p, BehaviorDomain.WORK, COMPLETE_STEP, FAILURE, UNKNOWN, false, "QUALITY_CONTROL", "WORK.DEFECT_CREATED");
        add(map, p, BehaviorDomain.WORK, CHECK, null, NONE, false, "QUALITY_CONTROL", "WORK.QUALITY_CHECKED", "WORK.DEFECT_DETECTED");
        add(map, p, BehaviorDomain.WORK, SELF_CORRECT, SUCCESS, NONE, false, "ERROR_RECOVERY", "WORK.SELF_CORRECTED");
        add(map, p, BehaviorDomain.WORK, REQUEST_HELP, NEUTRAL, NONE, false, "HELP_SEEKING", "WORK.SUPERVISOR_HELP_REQUESTED");
        add(map, p, BehaviorDomain.WORK, VIEW_INSTRUCTION, NEUTRAL, NONE, false, "FLEXIBILITY", "WORK.TASK_CHANGED");
        add(map, p, BehaviorDomain.WORK, COMPLETE_STEP, SUCCESS, NONE, false, "FLEXIBILITY", "WORK.CHANGE_ACCEPTED");
        add(map, p, BehaviorDomain.WORK, WAIT, NEUTRAL, NONE, false, "SELF_REGULATION", "WORK.BREAK_STARTED");
        add(map, p, BehaviorDomain.WORK, CHECK, SUCCESS, NONE, true, "WORK_SAFETY", "WORK.SAFETY_RULE_CHECKED");
    }

    private void common(Map<String, BehaviorEventDefinition> map) {
        add(map, null, BehaviorDomain.PASSIVE_PLAY, SELF_CORRECT, SUCCESS, NONE, false, "ERROR_RECOVERY", "COMMON.SELF_CORRECT");
        add(map, null, BehaviorDomain.PASSIVE_PLAY, RETRY, NEUTRAL, NONE, false, "ERROR_RECOVERY", "COMMON.RETRY");
        add(map, null, BehaviorDomain.PASSIVE_PLAY, REQUEST_HELP, NEUTRAL, NONE, false, "HELP_SEEKING", "COMMON.HELP_REQUEST");
        add(map, null, BehaviorDomain.PASSIVE_PLAY, ABORT, INCOMPLETE, NONE, false, "TASK_PERSISTENCE", "COMMON.ABORT");
    }

    private void add(Map<String, BehaviorEventDefinition> map, BehaviorPayloadType payloadType,
            BehaviorDomain domain, CanonicalActionType actionType, ObservedOutcome outcome,
            ErrorType errorType, boolean safetyRelevant, String skillCode, String... eventCodes) {
        addWithPolicy(map, payloadType, domain, actionType, outcome, errorType,
                safetyRelevant, EvidencePolicy.PROFILE_EVIDENCE, skillCode, eventCodes);
    }

    private void addContext(Map<String, BehaviorEventDefinition> map, BehaviorPayloadType payloadType,
            BehaviorDomain domain, CanonicalActionType actionType, ObservedOutcome outcome,
            ErrorType errorType, String skillCode, String... eventCodes) {
        addWithPolicy(map, payloadType, domain, actionType, outcome, errorType,
                false, EvidencePolicy.CONTEXT_ONLY, skillCode, eventCodes);
    }

    private void addWithPolicy(Map<String, BehaviorEventDefinition> map,
            BehaviorPayloadType payloadType, BehaviorDomain domain,
            CanonicalActionType actionType, ObservedOutcome outcome,
            ErrorType errorType, boolean safetyRelevant, EvidencePolicy evidencePolicy,
            String skillCode, String... eventCodes) {
        for (String eventCode : eventCodes) {
            var definition = new BehaviorEventDefinition(eventCode, payloadType, domain, actionType,
                    outcome, errorType, safetyRelevant, evidencePolicy, Set.of(),
                    List.of(new SkillEvidenceRule(skillCode, EvidenceRole.PRIMARY)), commonMeasurements());
            if (map.put(eventCode, definition) != null) {
                throw new IllegalStateException("중복 eventCode: " + eventCode);
            }
        }
    }

    private List<MeasurementRule> commonMeasurements() {
        return List.of(
                MeasurementRule.delta("eventOccurrence"),
                MeasurementRule.value("startLatencyMs", "action.startLatencyMs", MILLISECONDS, DURATION),
                MeasurementRule.value("omissionCountSnapshot", "error.omissionCount", COUNT, SNAPSHOT),
                MeasurementRule.value("repetitionCountSnapshot", "error.repetitionCount", COUNT, SNAPSHOT),
                MeasurementRule.value("wrongActionCountSnapshot", "error.wrongActionCount", COUNT, SNAPSHOT),
                MeasurementRule.value("sequenceErrorCountSnapshot", "error.sequenceErrorCount", COUNT, SNAPSHOT),
                MeasurementRule.value("retryCountSnapshot", "error.retryCount", COUNT, SNAPSHOT),
                MeasurementRule.value("selfCorrectionLatencyMs", "error.selfCorrectionLatencyMs", MILLISECONDS, DURATION),
                MeasurementRule.value("promptLevel", "support.promptLevel", COUNT, SNAPSHOT),
                MeasurementRule.value("supportCountSnapshot", "support.supportCount", COUNT, SNAPSHOT),
                MeasurementRule.value("helpRequestLatencyMs", "support.helpRequestLatencyMs", MILLISECONDS, DURATION),
                MeasurementRule.value("foregroundDurationMs", "presentation.foregroundDurationMs", MILLISECONDS, DURATION)
        );
    }

    private void requiredFields(Map<String, BehaviorEventDefinition> map) {
        require(map, "SHOP.TIME_LIMIT_STARTED", "timing");
        require(map, "SHOP.TIME_LIMIT_EXPIRED", "timing");
        require(map, "SHOP.MOVEMENT_SEGMENT_SUMMARIZED", "controlMode", "durationMs",
                "pathDistance", "straightDistance", "travelDistance");
        require(map, "SHOP.MOVEMENT_STOPPED", "controlMode", "durationMs", "travelDistance");
        require(map, "SHOP.MOVEMENT_BLOCKED", "controlMode", "x", "y");
        require(map, "SHOP.MOVEMENT_UNBLOCKED", "controlMode", "durationMs");
        require(map, "SHOP.MOVEMENT_SAMPLED", "controlMode", "x", "y", "blocked");
        require(map, "SHOP.MOVEMENT_BLOCKED_REPEATEDLY", "blockedCount", "observationWindowMs");
        require(map, "SHOP.SHELF_PROXIMITY_ENTERED", "stationId", "visitIndex", "isTargetZone");
        require(map, "SHOP.SHELF_PROXIMITY_EXITED", "stationId", "visitIndex", "durationMs");
        require(map, "SHOP.CHECKOUT_PROXIMITY_ENTERED", "stationId", "visitIndex");
        require(map, "SHOP.CHECKOUT_PROXIMITY_EXITED", "stationId", "visitIndex", "durationMs");
        require(map, "SHOP.TARGET_SHELF_APPROACHED", "stationId", "visitIndex");
        require(map, "SHOP.SHELF_REVISITED", "stationId", "visitIndex", "intervalSinceLastVisitMs");
        require(map, "SHOP.TARGET_SHELF_REVISITED", "stationId", "visitIndex", "intervalSinceLastVisitMs");
        require(map, "SHOP.TARGET_PASSED", "stationId", "visitIndex", "proximityDurationMs");
        require(map, "SHOP.ROUTE_LOOP_DETECTED", "stationSequence");
        require(map, "SHOP.OFF_TARGET_DWELL", "stationId", "durationMs");
        require(map, "SHOP.SHELF_OPENED", "stationId", "isTargetZone");
        require(map, "SHOP.NON_TARGET_SHELF_OPENED", "stationId", "isTargetZone");
        require(map, "SHOP.QUANTITY_MATCHED", "itemId", "requiredQuantity", "selectedQuantity");
        require(map, "SHOP.QUANTITY_OVERSHOT", "itemId", "requiredQuantity", "selectedQuantity");
        require(map, "SHOP.ITEM_SELECTED", "itemId");
        require(map, "SHOP.WRONG_ITEM_SELECTED", "itemId");
        require(map, "SHOP.ITEM_MISSING", "itemId", "requiredQuantity", "selectedQuantity");
        require(map, "SHOP.QUANTITY_CHANGED", "requiredQuantity", "selectedQuantity");
        require(map, "SHOP.SUBSTITUTE_SELECTED", "substituteItemId");
        require(map, "PAYMENT.METHOD_SELECTED", "paymentMethod");
        require(map, "COOK.INGREDIENT_SELECTED", "ingredientId");
        require(map, "COOK.WRONG_INGREDIENT", "ingredientId");
        require(map, "COOK.TOOL_SELECTED", "toolId");
        require(map, "COOK.QUANTITY_ERROR", "quantity", "targetQuantity");
        require(map, "COOK.TIMER_SET", "timerTargetMs");
        require(map, "HYGIENE.TASK_STARTED", "hygieneTaskId");
        require(map, "HYGIENE.TOOL_SELECTED", "toolId");
        require(map, "HYGIENE.WRONG_TOOL", "toolId");
        require(map, "CLOTHING.ITEM_SELECTED", "clothingItemId");
        require(map, "LAUNDRY.ITEM_CLASSIFIED", "laundryItemId", "classificationCode");
        require(map, "LAUNDRY.CLASSIFICATION_ERROR", "laundryItemId", "classificationCode");
        require(map, "LAUNDRY.MODE_SELECTED", "machineMode");
        require(map, "KIOSK.MENU_OPENED", "menuId");
        require(map, "KIOSK.ITEM_SELECTED", "itemId");
        require(map, "KIOSK.QUANTITY_SELECTED", "quantity");
        require(map, "ATM.AMOUNT_SELECTED", "amount");
        require(map, "PUBLIC.COUNTER_SELECTED", "counterId");
        require(map, "FIRE.EXIT_SELECTED", "selectedExitId");
        require(map, "LOST.HELPER_SELECTED", "helperType");
        require(map, "EMERGENCY.CONTACT_SELECTED", "emergencyContactType");
        require(map, "WORK.ITEM_CLASSIFIED", "workItemId");
        require(map, "WORK.QUANTITY_COMPLETED", "requiredQuantity", "completedQuantity");
    }

    private void evidenceRules(Map<String, BehaviorEventDefinition> map) {
        skills(map, "SHOP.OUT_OF_STOCK_DETECTED",
                new SkillEvidenceRule("SHOPPING_PROBLEM_RECOGNITION", EvidenceRole.PRIMARY),
                new SkillEvidenceRule("EXECUTIVE_FUNCTION", EvidenceRole.SECONDARY));
        skills(map, "SHOP.STAFF_HELP_REQUESTED",
                new SkillEvidenceRule("FUNCTIONAL_COMMUNICATION", EvidenceRole.PRIMARY),
                new SkillEvidenceRule("HELP_SEEKING", EvidenceRole.PRIMARY));
        skills(map, "SAFETY.HAZARD_RECHECKED",
                new SkillEvidenceRule("SAFETY_AWARENESS", EvidenceRole.PRIMARY),
                new SkillEvidenceRule("ATTENTION", EvidenceRole.SECONDARY));
        skills(map, "EMERGENCY.MESSAGE_COMPLETED",
                new SkillEvidenceRule("EMERGENCY_COMMUNICATION", EvidenceRole.PRIMARY),
                new SkillEvidenceRule("SAFETY_AWARENESS", EvidenceRole.SECONDARY));
    }

    private void measurementRules(Map<String, BehaviorEventDefinition> map) {
        // Optional source fields produce no measurements for historical untimed plays.
        for (var definition : List.copyOf(map.values())) {
            if (definition.requiredPayloadType() != BehaviorPayloadType.SHOPPING) continue;
            measure(map, definition.eventCode(),
                    value("timeLimitSeconds", "timing.timeLimitSeconds", SECONDS, TARGET),
                    value("timePolicyVersion", "timing.policyVersion", CODE, OBSERVATION),
                    value("timeStartedAt", "timing.startedAt", CODE, OBSERVATION),
                    value("timeElapsedMs", "timing.elapsedMs", MILLISECONDS, DURATION),
                    value("timeRemainingMs", "timing.remainingMs", MILLISECONDS, SNAPSHOT),
                    value("timeExpired", "timing.expired", CODE, OBSERVATION),
                    value("timeClockBasis", "timing.clockBasis", CODE, OBSERVATION));
        }
        measure(map, "SHOP.TIME_LIMIT_EXPIRED",
                value("cartItemCount", "cartItemCount", COUNT, SNAPSHOT),
                value("cartTotalAmount", "cartTotalAmount", KRW, SNAPSHOT),
                value("remainingObjectiveCount", "remainingObjectiveCount", COUNT, SNAPSHOT),
                value("overBudgetAmount", "overBudgetAmount", KRW, OBSERVATION));
        measure(map, "SHOP.SESSION_STARTED",
                value("objectiveCount", "objectiveCount", COUNT, TARGET),
                value("budgetAmount", "budgetAmount", KRW, TARGET));
        measure(map, "SHOP.BRIEFING_ADVANCED",
                value("briefingIndex", "briefingIndex", COUNT, SNAPSHOT),
                value("briefingDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.MOVEMENT_SEGMENT_SUMMARIZED",
                value("movementPathDistance", "pathDistance", GAME_DISTANCE, OBSERVATION),
                value("movementStraightDistance", "straightDistance", GAME_DISTANCE, OBSERVATION),
                value("movementTravelDistance", "travelDistance", GAME_DISTANCE, OBSERVATION),
                value("movementDurationMs", "durationMs", MILLISECONDS, DURATION),
                value("movementControlMode", "controlMode", CODE, OBSERVATION));
        measure(map, "SHOP.MOVEMENT_STOPPED",
                value("movementTravelDistance", "travelDistance", GAME_DISTANCE, OBSERVATION),
                value("movementDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.MOVEMENT_BLOCKED", MeasurementRule.delta("blockedMovementCount"));
        measure(map, "SHOP.MOVEMENT_SAMPLED",
                value("positionX", "x", GAME_DISTANCE, OBSERVATION),
                value("positionY", "y", GAME_DISTANCE, OBSERVATION),
                value("movementControlMode", "controlMode", CODE, OBSERVATION),
                value("movementBlocked", "blocked", CODE, OBSERVATION));
        measure(map, "SHOP.MOVEMENT_BLOCKED_REPEATEDLY",
                value("blockedMovementCount", "blockedCount", COUNT, OBSERVATION),
                value("blockedObservationWindowMs", "observationWindowMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.SHELF_PROXIMITY_ENTERED",
                value("shelfVisitIndex", "visitIndex", COUNT, SNAPSHOT),
                value("shelfRevisitIntervalMs", "intervalSinceLastVisitMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.SHELF_PROXIMITY_EXITED",
                value("shelfVisitDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.CHECKOUT_PROXIMITY_EXITED",
                value("checkoutProximityDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.SHELF_REVISITED", MeasurementRule.delta("shelfRevisitCount"),
                value("shelfRevisitIntervalMs", "intervalSinceLastVisitMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.TARGET_SHELF_REVISITED", MeasurementRule.delta("targetShelfRevisitCount"),
                value("targetShelfRevisitIntervalMs", "intervalSinceLastVisitMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.TARGET_SHELF_APPROACHED", MeasurementRule.delta("targetShelfApproachCount"));
        measure(map, "SHOP.OFF_TARGET_DWELL",
                value("offTargetDwellMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.ROUTE_LOOP_DETECTED", MeasurementRule.delta("routeLoopCount"));
        measure(map, "SHOP.SHELF_OPENED", MeasurementRule.delta("targetShelfOpenCount"));
        measure(map, "SHOP.NON_TARGET_SHELF_OPENED", MeasurementRule.delta("nonTargetShelfOpenCount"));
        measure(map, "SHOP.SHELF_CLOSED",
                value("shelfViewDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.TARGET_SHELF_LEFT_WITHOUT_SELECTION",
                MeasurementRule.delta("targetShelfLeftWithoutSelectionCount"),
                value("shelfViewDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.CART_OPENED", MeasurementRule.delta("cartCheckCount"),
                value("cartItemCount", "cartItemCount", COUNT, SNAPSHOT),
                value("remainingObjectiveCount", "remainingObjectiveCount", COUNT, SNAPSHOT));
        measure(map, "SHOP.CART_CLOSED",
                value("cartViewDurationMs", "durationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.ITEM_SELECTED", MeasurementRule.delta("selectionAttempt"),
                MeasurementRule.valueWithTarget("selectedQuantity", "payload.selectedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "SHOP.WRONG_ITEM_SELECTED",
                MeasurementRule.delta("selectionAttempt"), MeasurementRule.delta("wrongItem"),
                MeasurementRule.valueWithTarget("selectedQuantity", "payload.selectedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "SHOP.ITEM_MISSING", MeasurementRule.delta("omissionCount"),
                MeasurementRule.valueWithTarget("selectedQuantity", "payload.selectedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "SHOP.ITEM_SEARCH_STARTED",
                value("pathDistance", "pathDistance", GAME_DISTANCE, OBSERVATION),
                value("pathEfficiency", "pathEfficiency", RATIO, OBSERVATION));
        measure(map, "SHOP.WRONG_AISLE_ENTERED", MeasurementRule.delta("wrongAisle"));
        measure(map, "SHOP.TARGET_PASSED", MeasurementRule.delta("targetPassed"));
        measure(map, "SHOP.QUANTITY_CHANGED",
                MeasurementRule.valueWithTarget("selectedQuantity", "payload.selectedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "SHOP.QUANTITY_MATCHED", MeasurementRule.delta("quantityMatchedCount"),
                MeasurementRule.valueWithTarget("selectedQuantity", "payload.selectedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "SHOP.QUANTITY_OVERSHOT", MeasurementRule.delta("quantityOvershotCount"),
                MeasurementRule.valueWithTarget("selectedQuantity", "payload.selectedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "SHOP.EARLY_CHECKOUT_APPROACH", MeasurementRule.delta("earlyCheckoutCount"),
                value("remainingObjectiveCount", "remainingObjectiveCount", COUNT, SNAPSHOT));
        measure(map, "SHOP.CHECKOUT_SUBMITTED", MeasurementRule.delta("checkoutSubmitCount"),
                value("cartItemCount", "cartItemCount", COUNT, SNAPSHOT),
                value("cartTotalAmount", "cartTotalAmount", KRW, SNAPSHOT),
                value("remainingObjectiveCount", "remainingObjectiveCount", COUNT, SNAPSHOT),
                value("overBudgetAmount", "overBudgetAmount", KRW, OBSERVATION));
        measure(map, "SHOP.CHECKOUT_CORRECTION_STARTED",
                MeasurementRule.delta("checkoutCorrectionCount"));
        measure(map, "SHOP.IDLE_ENDED",
                value("idleDurationMs", "idleDurationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.APP_FOREGROUNDED",
                value("interruptionDurationMs", "interruptionDurationMs", MILLISECONDS, DURATION));
        measure(map, "SHOP.SESSION_COMPLETED",
                value("cartItemCount", "cartItemCount", COUNT, SNAPSHOT),
                value("cartTotalAmount", "cartTotalAmount", KRW, SNAPSHOT),
                value("remainingObjectiveCount", "remainingObjectiveCount", COUNT, SNAPSHOT));
        measure(map, "SHOP.PRICE_CHECKED", value("priceAmount", "priceAmount", KRW, OBSERVATION));
        measure(map, "SHOP.BUDGET_EXCEEDED",
                MeasurementRule.valueWithTarget("priceAmount", "payload.priceAmount",
                        "payload.budgetAmount", KRW, OBSERVATION));
        measure(map, "COOK.STEP_OMITTED", MeasurementRule.delta("omissionCount"));
        measure(map, "COOK.SEQUENCE_ERROR", MeasurementRule.delta("sequenceErrorCount"));
        measure(map, "COOK.QUANTITY_ERROR",
                MeasurementRule.valueWithTarget("quantity", "payload.quantity",
                        "payload.targetQuantity", COUNT, OBSERVATION));
        measure(map, "COOK.TIMER_SET", value("timerTargetMs", "timerTargetMs", MILLISECONDS, TARGET));
        measure(map, "COOK.TIMER_MISSED", value("timerErrorMs", "timerErrorMs", MILLISECONDS, OBSERVATION));
        measure(map, "HYGIENE.STEP_OMITTED", MeasurementRule.delta("omissionCount"));
        measure(map, "HYGIENE.STEP_REPEATED", MeasurementRule.delta("repetitionCount"));
        measure(map, "HYGIENE.SEQUENCE_ERROR", MeasurementRule.delta("sequenceErrorCount"));
        measure(map, "LAUNDRY.DETERGENT_AMOUNT_SELECTED",
                value("detergentAmount", "detergentAmount", COUNT, OBSERVATION));
        measure(map, "CLEAN.AREA_COMPLETED",
                value("cleaningCoverageRate", "cleaningCoverageRate", RATIO, OBSERVATION));
        measure(map, "KIOSK.QUANTITY_SELECTED", value("quantity", "quantity", COUNT, OBSERVATION));
        measure(map, "KIOSK.BUDGET_EXCEEDED",
                MeasurementRule.valueWithTarget("amount", "payload.amount", "payload.budget", KRW, OBSERVATION));
        measure(map, "ATM.AMOUNT_SELECTED", value("amount", "amount", KRW, OBSERVATION));
        measure(map, "WORK.QUANTITY_COMPLETED",
                MeasurementRule.valueWithTarget("completedQuantity", "payload.completedQuantity",
                        "payload.requiredQuantity", COUNT, OBSERVATION));
        measure(map, "WORK.DEFECT_CREATED", value("defectCount", "defectCount", COUNT, SNAPSHOT));
        measure(map, "WORK.SELF_CORRECTED", MeasurementRule.delta("selfCorrectionCount"));
    }

    private MeasurementRule value(String metricCode, String payloadField,
            oneuldo.behaviorlog.normalization.domain.MeasurementUnit unit,
            oneuldo.behaviorlog.normalization.domain.ValueSemantics semantics) {
        return MeasurementRule.value(metricCode, "payload." + payloadField, unit, semantics);
    }

    private void require(Map<String, BehaviorEventDefinition> map, String eventCode, String... fields) {
        BehaviorEventDefinition old = required(map, eventCode);
        map.put(eventCode, copy(old, Set.of(fields), old.evidenceRules(), old.measurementRules()));
    }

    private void skills(Map<String, BehaviorEventDefinition> map, String eventCode,
            SkillEvidenceRule... rules) {
        BehaviorEventDefinition old = required(map, eventCode);
        map.put(eventCode, copy(old, old.requiredPayloadFields(), List.of(rules), old.measurementRules()));
    }

    private void measure(Map<String, BehaviorEventDefinition> map, String eventCode,
            MeasurementRule... rules) {
        BehaviorEventDefinition old = required(map, eventCode);
        List<MeasurementRule> combined = new java.util.ArrayList<>(old.measurementRules());
        combined.addAll(List.of(rules));
        map.put(eventCode, copy(old, old.requiredPayloadFields(), old.evidenceRules(), combined));
    }

    private BehaviorEventDefinition required(Map<String, BehaviorEventDefinition> map, String eventCode) {
        BehaviorEventDefinition definition = map.get(eventCode);
        if (definition == null) throw new IllegalStateException("등록되지 않은 eventCode: " + eventCode);
        return definition;
    }

    private BehaviorEventDefinition copy(BehaviorEventDefinition old, Set<String> requiredFields,
            List<SkillEvidenceRule> evidence, List<MeasurementRule> measurements) {
        return new BehaviorEventDefinition(old.eventCode(), old.requiredPayloadType(), old.domain(),
                old.actionType(), old.defaultOutcome(), old.defaultErrorType(), old.safetyRelevant(),
                old.evidencePolicy(), requiredFields, evidence, measurements);
    }

    private void validateDefinitions(Map<String, BehaviorEventDefinition> map) {
        for (BehaviorEventDefinition definition : map.values()) {
            if (definition.domain() == null || definition.actionType() == null
                    || definition.defaultErrorType() == null || definition.evidencePolicy() == null
                    || definition.evidenceRules().isEmpty()) {
                throw new IllegalStateException("불완전한 이벤트 정의: " + definition.eventCode());
            }
            if (!definition.requiredPayloadFields().isEmpty()
                    && definition.requiredPayloadType() == null) {
                throw new IllegalStateException("payload type 없는 필수 필드 정의: " + definition.eventCode());
            }
            Class<?> payloadClass = payloadClass(definition.requiredPayloadType());
            for (String field : definition.requiredPayloadFields()) {
                if (payloadClass == null || !hasRecordComponent(payloadClass, field)) {
                    throw new IllegalStateException("존재하지 않는 필수 payload 필드: "
                            + definition.eventCode() + "/" + field);
                }
            }
            Set<String> measurementKeys = new java.util.HashSet<>();
            for (MeasurementRule rule : definition.measurementRules()) {
                String key = rule.metricCode() + ":" + rule.valueSemantics();
                if (!measurementKeys.add(key)) {
                    throw new IllegalStateException("중복 측정 규칙: " + definition.eventCode() + "/" + key);
                }
                validateMeasurementPath(definition, rule.sourcePath());
                validateMeasurementPath(definition, rule.targetSourcePath());
            }
        }
    }

    private void validateMeasurementPath(BehaviorEventDefinition definition, String path) {
        if (path == null) return;
        String[] parts = path.split("\\.", 2);
        if (parts.length != 2) throw new IllegalStateException("잘못된 측정 경로: " + path);
        Class<?> sourceClass = switch (parts[0]) {
            case "payload" -> payloadClass(definition.requiredPayloadType());
            case "error" -> oneuldo.behaviorlog.domain.context.ErrorContext.class;
            case "support" -> oneuldo.behaviorlog.domain.context.SupportContext.class;
            case "presentation" -> oneuldo.behaviorlog.domain.context.PresentationContext.class;
            case "taskResult" -> oneuldo.behaviorlog.domain.context.TaskResultContext.class;
            case "sessionEnd" -> oneuldo.behaviorlog.domain.context.SessionEndContext.class;
            case "action" -> oneuldo.behaviorlog.domain.BehaviorLog.class;
            default -> null;
        };
        boolean exists = hasAccessorPath(sourceClass, parts[1], parts[0].equals("action"));
        if (!exists) {
            throw new IllegalStateException("존재하지 않는 측정 경로: "
                    + definition.eventCode() + "/" + path);
        }
    }

    private boolean hasAccessorPath(Class<?> sourceClass, String path, boolean firstGetter) {
        for (String field : path.split("\\.")) {
            if (sourceClass == null) return false;
            String accessor = firstGetter
                    ? "get" + Character.toUpperCase(field.charAt(0)) + field.substring(1) : field;
            try {
                sourceClass = sourceClass.getMethod(accessor).getReturnType();
            } catch (NoSuchMethodException exception) {
                return false;
            }
            firstGetter = false;
        }
        return true;
    }

    private boolean hasGetter(Class<?> type, String field) {
        String getter = "get" + Character.toUpperCase(field.charAt(0)) + field.substring(1);
        return java.util.Arrays.stream(type.getMethods()).anyMatch(method -> method.getName().equals(getter));
    }

    private boolean hasRecordComponent(Class<?> type, String field) {
        return type.isRecord() && java.util.Arrays.stream(type.getRecordComponents())
                .anyMatch(component -> component.getName().equals(field));
    }

    private Class<?> payloadClass(BehaviorPayloadType type) {
        if (type == null) return null;
        return switch (type) {
            case PASSIVE_PLAY -> oneuldo.behaviorlog.domain.payload.PassivePlayBehaviorPayload.class;
            case TRANSPORT -> oneuldo.behaviorlog.domain.payload.TransportBehaviorPayload.class;
            case SHOPPING -> oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload.class;
            case COOKING -> oneuldo.behaviorlog.domain.payload.CookingBehaviorPayload.class;
            case HYGIENE_CLOTHING -> oneuldo.behaviorlog.domain.payload.HygieneClothingBehaviorPayload.class;
            case HOUSEHOLD -> oneuldo.behaviorlog.domain.payload.HouseholdBehaviorPayload.class;
            case KIOSK_ATM -> oneuldo.behaviorlog.domain.payload.KioskAtmBehaviorPayload.class;
            case SAFETY -> oneuldo.behaviorlog.domain.payload.SafetyBehaviorPayload.class;
            case WORK -> oneuldo.behaviorlog.domain.payload.WorkBehaviorPayload.class;
        };
    }
}
