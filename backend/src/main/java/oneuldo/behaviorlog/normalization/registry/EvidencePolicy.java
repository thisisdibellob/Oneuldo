package oneuldo.behaviorlog.normalization.registry;

/** 이벤트가 사용자 행동 프로파일에 기여하는 방식을 정의한다. */
public enum EvidencePolicy {
    PROFILE_EVIDENCE,
    CONTEXT_ONLY,
    EXCLUDED
}
