package oneuldo.behaviorlog.analysis;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import static org.assertj.core.api.Assertions.*;
class ConcretePracticeSectionsTest {
 final JsonMapper m=JsonMapper.builder().findAndAddModules().build();
 @Test void onlyModelAuthoredSectionTextIsJoinedAndEveryOtherFieldRemainsExact(){
  var raw=(ObjectNode)m.readTree("{\"analysis\":{\"summary\":[{\"text\":\"원문\",\"evidenceEventIds\":[\"E7\"]}],\"practicePlan\":{\"goal\":\"milk 2개\",\"itemCount\":1,\"rationale\":{\"observed\":[{\"findingId\":\"F1\",\"observationIndex\":0}],\"proposedPractice\":{\"change\":\"4종→우유1종\",\"instructions\":\"냉장 매대를 열고 우유2개를 담아 주세요.\",\"successCriteria\":\"우유2개 직접 제출; 대행은 별도\",\"nextObservation\":\"선택→수량2→제출\"}}}}}");
  var before=raw.deepCopy();var joined=ConcretePracticeSections.review(m,raw);
  assertThat(raw).isEqualTo(before);String text=joined.at("/analysis/practicePlan/rationale/proposedPractice").asString();
  assertThat(text).isEqualTo("변경: 4종→우유1종 안내: 냉장 매대를 열고 우유2개를 담아 주세요. 달성: 우유2개 직접 제출; 대행은 별도 확인: 선택→수량2→제출");
  ((ObjectNode)joined.at("/analysis/practicePlan/rationale")).set("proposedPractice",before.at("/analysis/practicePlan/rationale/proposedPractice"));assertThat(joined).isEqualTo(before);
 }
 @Test void stringsKeepLegacyCompatibilityAndMissingOrAdditionalSectionsAreRejected(){
  var legacy=(ObjectNode)m.readTree("{\"practicePlan\":{\"rationale\":\"기존 원문\"}}");assertThat(ConcretePracticeSections.profile(m,legacy)).isEqualTo(legacy);
  var bad=(ObjectNode)m.readTree("{\"practicePlan\":{\"rationale\":{\"change\":\"일부만\"}}}");
  assertThatThrownBy(()->ConcretePracticeSections.profile(m,bad)).hasMessage("INVALID_CONCRETE_PRACTICE_SECTIONS");
 }
 @Test void normalizationNeverTrimsTrailingJsonOrRepairsBrokenProviderOutput(){
  assertThatThrownBy(()->ConcretePracticeSections.reviewText(m,"{\"analysis\":{}} {}" )).isInstanceOf(RuntimeException.class);
  assertThatThrownBy(()->ConcretePracticeSections.profileText(m,"{\"practicePlan\":{}} garbage" )).isInstanceOf(RuntimeException.class);
 }
}
