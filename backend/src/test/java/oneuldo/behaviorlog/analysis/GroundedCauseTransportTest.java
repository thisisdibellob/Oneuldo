package oneuldo.behaviorlog.analysis;
import org.junit.jupiter.api.Test;import tools.jackson.databind.json.JsonMapper;
import oneuldo.behaviorlog.analysis.service.*;import java.util.*;
import static org.assertj.core.api.Assertions.*;
class GroundedCauseTransportTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 GroundedPracticeContract.Rejected rejected(String path,String quote){return new GroundedPracticeContract.Rejected("{\"analysis\":{\"uncertainties\":[\"이해 부족인지 확인되지 않습니다.\"],\"practicePlan\":{\"itemCount\":1}}}",List.of(new GroundedPracticeContract.Violation("UNCONFIRMED_CAUSE",path,quote,"원인 미확인")));}
 @Test void duplicateSourceMayBeOmittedOnlyForIdenticalClosedCauseEnums(){
  String source="FULL_ORIGINAL_SOURCE_CANARY";var r=rejected("/uncertainties/0","이해 부족인지 확인되지 않습니다.");
  String compact=GroundedTextPatch.prompt(m,source,r,true);assertThat(compact).doesNotContain(source).contains(QwenTokenCounter.textHash(source),"ENUM_ONLY_CAUSE_CORRECTION");
  assertThat(GroundedTextPatch.prompt(m,source,r,false)).contains(source);assertThat(GroundedTextPatch.prompt(m,source,r)).contains(source);
  String repaired=GroundedTextPatch.apply(m,r,"{\"patches\":{\"/uncertainties/0\":\"원인은 기록으로 확인할 수 없습니다.\"}}");
  assertThat(m.readTree(repaired).at("/analysis/practicePlan/itemCount").asInt()).isEqualTo(1);
  assertThat(GroundedTextPatch.outputSchema(m,r,true).toString()).contains("원인은 기록으로 확인할 수 없습니다.");
 }
 @Test void factsAndOpenTextCorrectionsStillReceiveEveryOriginalSource(){
  String source="FULL_ORIGINAL_SOURCE_CANARY";
  assertThat(GroundedTextPatch.prompt(m,source,rejected("/findings/0/interpretation","이해 부족 가능성"),true)).contains(source);
  assertThat(GroundedTextPatch.prompt(m,source,rejected("/uncertainties/0","2회 실패의 원인"),true)).contains(source);
  var mixed=new GroundedPracticeContract.Rejected("{\"analysis\":{}}",List.of(new GroundedPracticeContract.Violation("UNCONFIRMED_CAUSE","/uncertainties/0","이해 부족",""),new GroundedPracticeContract.Violation("PROFILE_OUTCOME_CONTRADICTS_ORIGINAL","/summary","구매 완료","")));
  assertThat(GroundedTextPatch.prompt(m,source,mixed,true)).contains(source);
 }
 @Test void negotiatedProposalSerializedInsidePatchIsJoinedWithoutChangingModelTextOrOtherFields(){
  var candidate=m.createObjectNode();var analysis=candidate.putObject("analysis");analysis.put("summary","관찰 그대로");var plan=analysis.putObject("practicePlan");plan.put("itemCount",1);
  String before="변경: 우유 2개 안내: 매대로 이동 달성: 우유 2개 확인: 담기";plan.put("rationale",before);
  var r=new GroundedPracticeContract.Rejected(candidate.toString(),List.of(new GroundedPracticeContract.Violation("PRODUCT_SELECTION_GUIDANCE_REQUIRED","/practicePlan/rationale",before,"매대를 연다")));
  var sections=m.createObjectNode().put("change","우유 2개").put("instructions","냉장 매대를 열고 우유를 고릅니다.").put("successCriteria","우유 2개").put("nextObservation","담기");
  var patch=m.createObjectNode();patch.putObject("patches").put("/practicePlan/rationale",sections.toString());
  var after=m.readTree(GroundedTextPatch.apply(m,r,patch.toString()));
  assertThat(after.at("/analysis/practicePlan/rationale").asString()).isEqualTo("변경: 우유 2개 안내: 냉장 매대를 열고 우유를 고릅니다. 달성: 우유 2개 확인: 담기");
  assertThat(after.at("/analysis/summary").asString()).isEqualTo("관찰 그대로");assertThat(after.at("/analysis/practicePlan/itemCount").asInt()).isEqualTo(1);
  sections.put("successCriteria","우유 3개");patch.putObject("patches").put("/practicePlan/rationale",sections.toString());
  assertThatThrownBy(()->GroundedTextPatch.apply(m,r,patch.toString())).isInstanceOf(GroundedTextPatch.NumericMismatch.class);
  sections.put("successCriteria","우유 2개").put("invented","추가");patch.putObject("patches").put("/practicePlan/rationale",sections.toString());
  assertThatThrownBy(()->GroundedTextPatch.apply(m,r,patch.toString())).isInstanceOf(IllegalArgumentException.class);
 }
}
