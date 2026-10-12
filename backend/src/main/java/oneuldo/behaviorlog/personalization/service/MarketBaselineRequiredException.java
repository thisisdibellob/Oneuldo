package oneuldo.behaviorlog.personalization.service;

/** Absence of a submitted market play and of an AI profile, never an ability assessment. */
public final class MarketBaselineRequiredException extends RuntimeException {
    public MarketBaselineRequiredException() {
        super("첫 관찰 과제로 장보기를 시작해 주세요. 아직 제출한 장보기와 준비된 AI 프로필이 없어요.");
    }
}
