package oneuldo.behaviorlog.analysis;
import oneuldo.behaviorlog.analysis.service.KnowledgeRetrieval;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class KnowledgeRetrievalTest {
 final JsonMapper m=JsonMapper.builder().build();
 @Test void retrievesTwoCollectionsWithoutMutatingOriginalOrInferringResults(){
  var source=m.readTree("{\"eventCode\":\"SHOP.CART_OPENED\",\"quantityAfter\":2}");var before=source.deepCopy();
  var result=KnowledgeRetrieval.retrieve(source);
  assertThat(source).isEqualTo(before);
  assertThat(result.path("gameDocuments").toString()).contains("G-CART").doesNotContain("G-WORLD");
  assertThat(result.path("officialDocuments").toString()).contains("O-ADAPT","O-STEPS");
  assertThat(result).isEqualTo(KnowledgeRetrieval.retrieve(source));
  assertThat(result.path("gameDocuments").size()).isLessThanOrEqualTo(3);
  assertThat(result.path("officialDocuments").size()).isLessThanOrEqualTo(3);
 }
 @Test void absentActionDoesNotRetrieveItsGameInstructions(){
  var result=KnowledgeRetrieval.retrieve(m.readTree("{\"eventCode\":\"SHOP.SESSION_ENDED\"}"));
  assertThat(result.path("gameDocuments").toString()).contains("G-END").doesNotContain("G-CART","G-HELP");
 }
 @Test void unrelatedSceneDoesNotReceiveMarketInstructions(){
  var result=KnowledgeRetrieval.retrieve(m.readTree("{\"eventCode\":\"BUS.SESSION_ENDED\",\"quantityAfter\":2}"));
  assertThat(result.path("gameDocuments").size()).isZero();
  assertThat(result.path("officialDocuments").size()).isPositive();
 }
 @Test void retrievalSurvivesFinalEncodingAndIndependentReviewWithRawSources() {
  var mapper=JsonMapper.builder().findAndAddModules().build();
  var fixture=new MovementProjectionTest();var input=fixture.input(fixture.fixture());
  var factory=new oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisPromptFactory(mapper);
  var refs=new oneuldo.behaviorlog.analysis.service.AnalysisReferences(mapper,input);
  String source=oneuldo.behaviorlog.analysis.service.AnalysisSynthesisPrompt.build(mapper,factory,input,java.util.List.of(),refs,false);
  var codec=new oneuldo.behaviorlog.analysis.service.FinalSourceEncoding(mapper);
  var decoded=codec.decode(mapper.readTree(source));
  var review=codec.decode(mapper.readTree(oneuldo.behaviorlog.analysis.service.AnalysisReviewPrompt.build(mapper,source,null,refs)));
  assertThat(decoded.path("retrievedKnowledge").path("officialDocuments").size()).isPositive();
  assertThat(review.path("retrievedKnowledge")).isEqualTo(decoded.path("retrievedKnowledge"));
  assertThat(review.path("sourceEventDetails")).isEqualTo(decoded.path("sourceEventDetails"));
  assertThat(review.path("sourceMovementContext")).isEqualTo(decoded.path("sourceMovementContext"));
 }
}
