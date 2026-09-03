package oneuldo.behaviorlog.analysis.domain;

import java.time.Instant;

/** AI 행동 분석 데이터셋에 포함할 원본 이벤트 발생 기간이다. */
public record BehaviorAnalysisInputRequest(
        Instant analysisFrom,
        Instant analysisTo
) {
}
