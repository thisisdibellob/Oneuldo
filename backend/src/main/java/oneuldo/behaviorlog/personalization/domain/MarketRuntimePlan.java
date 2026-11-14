package oneuldo.behaviorlog.personalization.domain;

import java.util.Map;

/** Playable choices only. Actor identity, clocks and provenance are never AI configuration. */
public record MarketRuntimePlan(Environment environment, Learning learning, String matchRule,
        int stockPerProduct, Map<String,Integer> stockOverrides,
        int alarmPenaltyPoints, int wrongWayPenaltyPoints, int cashierRequestPenaltyPoints) {
    public record Environment(String layoutId, int employeeCount, int customerCount, int pillarCount,
            int chairCount, int cashierCount, String kioskLane, boolean entranceConstruction) {}
    public record Learning(String stockoutProductId, boolean allowSubstitution,
            boolean budgetChoiceEnabled, int choiceBudget, String checkoutReviewMode) {}
}
