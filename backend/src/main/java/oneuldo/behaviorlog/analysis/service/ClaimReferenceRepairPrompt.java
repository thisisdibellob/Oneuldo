package oneuldo.behaviorlog.analysis.service;
import tools.jackson.databind.ObjectMapper;
/** A bounded format-only repair instruction; original facts and AI audit remain untouched. */
public final class ClaimReferenceRepairPrompt {
 private ClaimReferenceRepairPrompt() {}
 public static String build(ObjectMapper mapper, ReviewEvidenceException.Details details) {
  return "\n검사 오류: " + mapper.writeValueAsString(details)
   + ". 전체 응답의 모든 문장 객체에서 text의 E번호·범위를 제거하고 선택한 실제 근거는 evidenceEventIds에 유지하세요. 원본·불확실성·판정을 임의 변경하지 말고 전체 JSON을 반환하세요.";
 }
}
