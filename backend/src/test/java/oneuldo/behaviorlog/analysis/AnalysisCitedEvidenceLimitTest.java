package oneuldo.behaviorlog.analysis;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import tools.jackson.databind.node.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class AnalysisCitedEvidenceLimitTest {
 final MovementProjectionTest fixture=new MovementProjectionTest();
 final AiBehaviorAnalysisValidator validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
 BehaviorAnalysisInputResponse input(){
  var tree=fixture.fixture();var events=(ArrayNode)tree.at("/input/sessions/0/events");var original=(ObjectNode)events.get(0);
  while(events.size()<35)events.add(original.deepCopy().put("behaviorLogId",UUID.randomUUID().toString()));
  return fixture.input(tree);
 }
 AiBehaviorAnalysis result(BehaviorAnalysisInputResponse input,int findingCount,int sessionCount){
  var ids=new ArrayList<UUID>();for(var event:input.input().sessions().getFirst().events())ids.add(event.behaviorLogId());
  var finding=new AiBehaviorAnalysis.Finding("F1","상품 선택","기록된 조작","원인은 미확인",List.of(),ids.subList(0,findingCount),"기존 문자 안내");
  var assessments=new ArrayList<AiBehaviorAnalysis.SessionAssessment>();
  for(var session:input.input().sessions())assessments.add(new AiBehaviorAnalysis.SessionAssessment(session.sessionId(),"UNDETERMINED","수행 원인 미확인",session==input.input().sessions().getFirst()?ids.subList(0,sessionCount):List.of(session.events().getFirst().behaviorLogId())));
  return new AiBehaviorAnalysis("기록된 관찰",List.of(finding),assessments,List.of("원인 미확인"),new AiBehaviorAnalysis.PracticePlan(List.of("F1"),"목표 상품 선택","기존 안내 활용",1,2,"LOW","LOW","SIMPLIFIED",List.of("OBSERVATION_PRACTICE")));
 }
 @Test void over_limit_finding_has_exact_diagnostic_without_weakening_or_truncating_any_source(){
  var input=input();var bad=result(input,31,1);var before=fixture.mapper.writeValueAsString(input);
  assertThatThrownBy(()->validator.validate(bad,input)).isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
   assertThat(e.details().code()).isEqualTo("ANALYSIS_FINDING_EVIDENCE_COUNT_EXCEEDS_LIMIT");assertThat(e.details().path()).isEqualTo("/analysis/findings/0");
  });
  assertThat(bad.findings().getFirst().evidenceEventIds()).hasSize(31);assertThat(fixture.mapper.writeValueAsString(input)).isEqualTo(before);
  assertThatCode(()->validator.validate(result(input,30,1),input)).doesNotThrowAnyException();
 }
 @Test void session_explanation_union_has_the_same_existing_limit_and_specific_path(){
  var input=input();var bad=result(input,1,31);
  assertThatThrownBy(()->validator.validate(bad,input)).isInstanceOfSatisfying(ReviewEvidenceException.class,e->{
   assertThat(e.details().code()).isEqualTo("ANALYSIS_SESSION_EVIDENCE_COUNT_EXCEEDS_LIMIT");assertThat(e.details().path()).isEqualTo("/analysis/sessionAssessments/0");
  });
  assertThat(bad.sessionAssessments().getFirst().evidenceEventIds()).hasSize(31);assertThatCode(()->validator.validate(result(input,1,30),input)).doesNotThrowAnyException();
 }
}
