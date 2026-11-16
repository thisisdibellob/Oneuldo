package oneuldo.behaviorlog.analysis;
import java.nio.file.*;import java.util.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.*;import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
/** A guidance-only correction is sent without event-by-event rows; any past-action correction keeps the complete source. */
class GroundedGuidancePatchSourceTest {
 static final Path CALLS=Path.of("../output/analysis-efficiency-20261115/results/before/careful-checker-1-baseline-pre/model-calls.json");
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 static final String CANDIDATE="{\"analysis\":{\"practicePlan\":{\"goal\":\"흰 우유 2개\",\"rationale\":{\"proposedPractice\":\"변경: 4종→1종 안내: 냉장 매대로 이동 확인: 선택 기록\"}},\"uncertainties\":[\"원인은 실수인지 확인인지 알 수 없습니다.\"],\"summary\":[{\"text\":\"합성 배우는 장바구니를 열었습니다.\"}]}}";
 String finalSource() throws Exception {
  Assumptions.assumeTrue(Files.exists(CALLS));
  for(var call:m.readTree(Files.readString(CALLS)))if(call.path("systemPrompt").asString().startsWith("Judge TASK OUTCOME"))return call.path("inputPrompt").asString();
  Assumptions.abort("no final request recorded");return null;
 }
 GroundedPracticeContract.Rejected rejected(GroundedPracticeContract.Violation...issues){return new GroundedPracticeContract.Rejected(CANDIDATE,List.of(issues));}
 static final GroundedPracticeContract.Violation PLAN=new GroundedPracticeContract.Violation("PRODUCT_SELECTION_GUIDANCE_REQUIRED","/practicePlan/rationale/proposedPractice","변경: 4종→1종 안내: 냉장 매대로 이동 확인: 선택 기록","매대를 여는 순서를 쓴다.");
 static final GroundedPracticeContract.Violation CAUSE=new GroundedPracticeContract.Violation("UNCONFIRMED_CAUSE","/uncertainties/0","원인은 실수인지 확인인지 알 수 없습니다.","원인 미확인만 보존한다.");
 static final GroundedPracticeContract.Violation PAST=new GroundedPracticeContract.Violation("UNRECORDED_ACTION_HYPOTHESIS","/summary/0/text","합성 배우는 장바구니를 열었습니다.","기록된 행동만 보존한다.");
 @Test void guidance_and_cause_limits_are_corrected_from_task_and_product_sources_only() throws Exception {
  String source=finalSource();String prompt=GroundedTextPatch.prompt(m,source,rejected(PLAN,CAUSE),false);
  assertThat(prompt).startsWith("{\"correctionContext\":\"PLAN_GUIDANCE_CORRECTION\"").contains(QwenTokenCounter.textHash(source));
  var sent=m.readTree(prompt.substring(0,prompt.indexOf("\nProse correction only")));
  var kept=sent.path("planGuidanceSource");var original=new FinalSourceEncoding(m).decode(m.readTree(source));
  assertThat(kept.path("taskContext")).isEqualTo(original.path("taskContext"));
  assertThat(kept.path("sessionSourceLedger")).isEqualTo(original.path("sessionSourceLedger"));
  assertThat(kept.path("practiceProductSources")).isEqualTo(original.path("practiceProductSources"));
  assertThat(kept.has("sourceMovementContext")).isFalse();assertThat(kept.has("retrievedKnowledge")).isFalse();
  assertThat(prompt).contains("\"permittedTextTargets\"").contains("/practicePlan/rationale/proposedPractice").contains("/uncertainties/0");
  assertThat(QwenTokenCounter.count(prompt)).isLessThan(QwenTokenCounter.count(source)/2);
 }
 @Test void any_past_action_correction_keeps_the_complete_source() throws Exception {
  String source=finalSource();
  assertThat(GroundedTextPatch.prompt(m,source,rejected(PAST),false)).startsWith(source);
  assertThat(GroundedTextPatch.prompt(m,source,rejected(PLAN,PAST),false)).startsWith(source);
 }
 @Test void a_source_without_task_or_ledger_is_sent_whole() {
  String source="{\"practiceHistory\":[],\"implementedSupportCapabilities\":[\"TEXT_GUIDANCE\"]}";
  assertThat(GroundedTextPatch.prompt(m,source,rejected(PLAN),false)).startsWith(source);
 }
}
