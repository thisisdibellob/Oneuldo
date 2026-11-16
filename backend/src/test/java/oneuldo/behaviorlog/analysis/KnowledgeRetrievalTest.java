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
  assertThat(result.path("officialDocuments").toString()).contains("O-STEPS");
  assertThat(result).isEqualTo(KnowledgeRetrieval.retrieve(source));
  assertThat(result.path("gameDocuments").size()).isLessThanOrEqualTo(2);
  assertThat(result.path("officialDocuments").size()).isLessThanOrEqualTo(2);
 }
 @Test void absentActionDoesNotRetrieveItsGameInstructions(){
  var result=KnowledgeRetrieval.retrieve(m.readTree("{\"eventCode\":\"SHOP.SESSION_ENDED\"}"));
  assertThat(result.path("gameDocuments").toString()).contains("G-END").doesNotContain("G-CART","G-HELP");
 }
 @Test void unrelatedSceneDoesNotReceiveMarketInstructions(){
  var result=KnowledgeRetrieval.retrieve(m.readTree("{\"eventCode\":\"BUS.SESSION_ENDED\",\"quantityAfter\":2}"));
  assertThat(result.path("gameDocuments").size()).isZero();
  assertThat(result.path("matchedGames").size()).isZero();
  assertThat(result.path("officialDocuments").size()).isPositive();
 }
 @Test void playsWithDifferentRecordedBehaviorReceiveDifferentDocuments(){
  var quantity=KnowledgeRetrieval.retrieve(m.readTree("[\"SHOP.SESSION_ENDED\",\"SHOP.QUANTITY_CHANGED\",\"SHOP.QUANTITY_CHANGED\",\"SHOP.CART_OPENED\"]"));
  var route=KnowledgeRetrieval.retrieve(m.readTree("[\"SHOP.SESSION_ENDED\",\"SHOP.SHELF_REVISITED\",\"SHOP.ROUTE_LOOP_DETECTED\",\"SHOP.WRONG_AISLE_ENTERED\"]"));
  assertThat(quantity.path("gameDocuments").toString()).contains("G-CART").doesNotContain("G-WORLD");
  assertThat(route.path("gameDocuments").toString()).contains("G-WORLD","G-PLAN").doesNotContain("G-CART");
  assertThat(quantity.path("officialDocuments")).isNotEqualTo(route.path("officialDocuments"));
  assertThat(route.path("matchedTopicEventCounts").path("movement").asInt()).isEqualTo(3);
 }
 @Test void countsWholeEventNamesAndSendsOnlyFieldsTheModelReads(){
  var result=KnowledgeRetrieval.retrieve(m.readTree("[\"SHOP.MOVEMENT_BLOCKED_REPEATEDLY\",\"SHOP.MOVEMENT_SAMPLED\"]"));
  assertThat(result.path("matchedTopicEventCounts").path("movement").asInt()).isEqualTo(1);
  for(var document:result.path("gameDocuments")){
   assertThat(document.propertyNames()).containsExactlyInAnyOrder("id","title","source","summary","limitations");
  }
  assertThat(result.path("corpusSha256").asString()).hasSize(64);
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
