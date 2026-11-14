package oneuldo.behaviorlog.analysis.service;

import tools.jackson.databind.ObjectMapper;

/** Retry only a rejected literal station citation; never rewrites the AI assessment. */
public final class StationClaimRepairPrompt {
    private StationClaimRepairPrompt() {}
    public static String build(ObjectMapper mapper, ReviewEvidenceException.Details failure) {
        return "\n매대 근거 검사 오류: " + mapper.writeValueAsString(failure)
                + ". stationClaims만 해당 원본과 대조하세요. 배열 원소 키는 eventId,stationId,kind 세 개뿐입니다. "
                + "stationClaimSources의 행에 있는 사건만 사용하고 stationId와 kind를 그대로 복사합니다. "
                + "INVALID는 해당 ID가 원본 매대 사건이 아닌지 또는 값이 다른지 확인하여 잘못된 항목을 고칩니다. "
                + "COVERAGE는 이미 분석에서 인용한 누락 ID의 원본 행을 추가합니다. UNKNOWN을 shelf로 채우지 않습니다. "
                + "상품 수량 사건을 매대 사건으로 만들지 않습니다. 분석의 상품 선택 근거나 성패를 지우거나 바꾸어 통과하지 말고 전체 JSON을 다시 출력하세요.";
    }
}
