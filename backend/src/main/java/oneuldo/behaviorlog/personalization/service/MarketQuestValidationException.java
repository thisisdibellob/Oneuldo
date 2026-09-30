package oneuldo.behaviorlog.personalization.service;

import java.util.Map;

/** Trusted content-contract facts for repair; never instructions copied from model output. */
public final class MarketQuestValidationException extends IllegalArgumentException {
    private final Map<String, Object> details;

    public MarketQuestValidationException(String field, Map<String, Object> details) {
        super("AI 장보기 퀘스트 검증 실패: " + field);
        this.details = Map.copyOf(details);
    }

    public Map<String, Object> details() { return details; }
}
