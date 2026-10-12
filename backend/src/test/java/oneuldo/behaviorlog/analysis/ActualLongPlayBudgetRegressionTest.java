package oneuldo.behaviorlog.analysis;
import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
class ActualLongPlayBudgetRegressionTest {
 @Test void actual_post_source_fits_with_format_repair_reserve() throws Exception {
  var fixture=new MovementProjectionTest();var mapper=fixture.mapper;
  var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/generation-repair/final-source-post-failed-v54.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
  String source=Files.readString(path);var codec=new FinalSourceEncoding(mapper);var original=codec.decode(mapper.readTree(source));
  assertThat(codec.decode(codec.encode(original))).isEqualTo(original);
  var refs=new AnalysisReferences(mapper,fixture.input(fixture.fixture()));var budget=new AnalysisTokenBudget();
  org.springframework.test.util.ReflectionTestUtils.setField(budget,"requestTokens",18000);
  org.springframework.test.util.ReflectionTestUtils.setField(budget,"finalOutputTokens",2400);
  var estimate=FinalAnalysisBudget.estimate(mapper,budget,FinalAnalysisPromptCompactor.systemPrompt(),source,refs,true,"\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.");
  assertThat(estimate.required()).isLessThanOrEqualTo(18000);
  Files.writeString(Path.of("../output/post-actual15-fixes-20261012/legacy-regression-reruns/actual-post-v55-budget.json"),mapper.writeValueAsString(Map.of("required",estimate.required(),"limit",18000,"allRawValuesPreserved",true)));
 }
 @Test void long_actual_source_retains_every_fact_and_fits_the_review_request() throws Exception {
  var fixture=new MovementProjectionTest();var mapper=fixture.mapper;
  var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/generation-repair/final-source-failed-v51.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
  var codec=new FinalSourceEncoding(mapper);var old=codec.decode(mapper.readTree(Files.readString(path)));
  var current=old.deepCopy();
  current.put("stage","FINAL: 원본 사건과 구간 해석을 대조하여 판단한다. 원본을 우선하고 미제공 행동을 가정하지 않는다. ID 존재는 문장 진실의 증명이 아니다.");
  current.put("interpretationRule","관찰·가설·미확인 원인을 구별한다. 근거 없는 대안은 []로 두고 uncertainties에 한계를 쓴다. 지원은 다음에 실행 가능한 행동으로 제안한다. 전체 판단 경계는 system 지시를 따른다.");
  for(var key:old.propertyNames()) if(!List.of("stage","interpretationRule").contains(key))assertThat(current.get(key)).isEqualTo(old.get(key));
  var refs=new AnalysisReferences(mapper,fixture.input(fixture.fixture()));
  var budget=new AnalysisTokenBudget();ReflectionTestUtils.setField(budget,"requestTokens",18000);ReflectionTestUtils.setField(budget,"finalOutputTokens",2400);
  String source=codec.encodeReadable(current).toString();
  var estimate=FinalAnalysisBudget.estimate(mapper,budget,FinalAnalysisPromptCompactor.systemPrompt(),source,refs,true,"\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.");
  assertThat(estimate.required()).isLessThanOrEqualTo(18000);
  var detail=new ReviewEvidenceException.Details("INLINE_REVIEW_REFERENCE_NOT_ALLOWED","/findings/0/observation/1",List.of("E8"));
  String retry=ClaimReferenceRepairPrompt.build(mapper,detail);
  String reviewed=AnalysisReviewPrompt.build(mapper,source,new AiBehaviorAnalysis("",List.of(),List.of(),List.of(),null,List.of()),refs);
  int repaired=budget.total(AnalysisReviewPrompt.system(),reviewed+"\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요."+retry,2400);
  assertThat(repaired).isLessThanOrEqualTo(18000);
  Files.writeString(Path.of("../output/post-actual15-fixes-20261012/legacy-regression-reruns/actual-long-play-v53-budget.json"),mapper.writeValueAsString(Map.of("required",estimate.required(),"limit",18000,"rawSourceFieldsUnchanged",true,"formatRepairRequired",repaired)));
 }
 @Test void actual_minsu_second_round_keeps_raw_sources_and_fits_real_transport_reserve() throws Exception {
  var fixture=new MovementProjectionTest();var mapper=fixture.mapper;
  var path=Path.of("/Users/bluem/Documents/GitHub/Oneuldo/output/persona-actual-15-v43-v34-20261011/generation-repair/final-source-g3r2-failed-v57.json");
  org.junit.jupiter.api.Assumptions.assumeTrue(Files.exists(path));
  String source=Files.readString(path);var codec=new FinalSourceEncoding(mapper);var original=codec.decode(mapper.readTree(source));
  assertThat(codec.decode(codec.encode(original))).isEqualTo(original);
  var refs=new AnalysisReferences(mapper,fixture.input(fixture.fixture()));var budget=new AnalysisTokenBudget();
  ReflectionTestUtils.setField(budget,"requestTokens",18000);ReflectionTestUtils.setField(budget,"finalOutputTokens",2400);
  String reviewed=AnalysisReviewPrompt.build(mapper,source,new AiBehaviorAnalysis("",List.of(),List.of(),List.of(),null,List.of()),refs);
  var decoded=codec.decode(mapper.readTree(reviewed));
  if(original.path(MovementSourceContext.FIELD) instanceof tools.jackson.databind.node.ObjectNode movement
      && MovementSourceContext.LEGACY_RULE.equals(movement.path("rule").asString()))
    movement.put("rule",MovementSourceContext.RULE);
  for(String field:List.of(SourceEventDetails.FIELD,MovementSourceContext.FIELD,"taskContext","matchingContentCatalog","behaviorTimeline"))
    if(original.has(field))assertThat(decoded.get(field)).as(field).isEqualTo(original.get(field));
  var estimate=FinalAnalysisBudget.estimate(mapper,budget,FinalAnalysisPromptCompactor.systemPrompt(),source,refs,true,"\n구조와 실제 사건 참조를 수정하세요. JSON 하나만 출력하세요.");
  assertThat(estimate.required()).isLessThanOrEqualTo(18000-256);
  assertThat(Files.readString(path)).isEqualTo(source);
  Files.writeString(Path.of("../output/post-actual15-fixes-20261012/legacy-regression-reruns/actual-g3r2-final-review-v58-budget.json"),mapper.writeValueAsString(Map.of("required",estimate.required(),"transportLimit",17744,"allRawValuesPreserved",true)));
 }

}
