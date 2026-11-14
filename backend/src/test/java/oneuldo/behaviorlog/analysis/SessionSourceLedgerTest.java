package oneuldo.behaviorlog.analysis;
import org.junit.jupiter.api.Test;
import oneuldo.behaviorlog.analysis.service.SessionSourceLedger;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class SessionSourceLedgerTest {
 final JsonMapper m=JsonMapper.builder().build();
 @Test void separatesOpenSelectionSubmissionAndOwnersWithoutScoring() {
  var input=m.readTree("""
  {"sessions":[{"sessionId":"one","integrity":{"status":"COMPLETE"},"events":[
   {"behaviorLogId":"start","sequence":1,"action":{"eventCode":"SHOP.SESSION_STARTED"},"payload":{"marketContent":{"sceneSnapshot":{"mission":{"objectives":[{"productId":"apple","quantity":1}],"budget":1200}}}}},
   {"sequence":2,"action":{"eventCode":"SHOP.REPLAY_CONTEXT_CHANGED"},"payload":{"marketContent":{"replayExecutionContext":{"source":"synthetic","executionOwner":"PERSONA_ACTOR"}}}},
   {"sequence":3,"action":{"eventCode":"SHOP.CART_OPENED"}},
   {"sequence":4,"action":{"eventCode":"SHOP.REPLAY_CONTEXT_CHANGED"},"payload":{"marketContent":{"replayExecutionContext":{"executionOwner":"SYSTEM_COMPLETION"}}}},
   {"sequence":5,"action":{"eventCode":"SHOP.CHECKOUT_SUBMITTED"},"payload":{"marketContent":{"cart":{},"runtimeState":{"paid":false}}}},
   {"sequence":6,"action":{"eventCode":"SHOP.SESSION_ENDED"},"sessionEnd":{"reason":"FLOW_FINISHED"},"payload":{"timing":{"expired":false,"remainingMs":1000},"marketContent":{"cart":{}}}}
  ]}]}
  """);
  var before=input.deepCopy();var r=SessionSourceLedger.build(m,input).get(0);
  assertThat(r.path("eventCounts").path("SHOP.CART_OPENED").asInt()).isEqualTo(1);
  assertThat(r.path("eventCounts").path("SHOP.QUANTITY_CHANGED").asInt()).isZero();
  assertThat(r.path("countsByRecordedOwner").path("PERSONA_ACTOR").has("SHOP.CHECKOUT_SUBMITTED")).isFalse();
  assertThat(r.path("countsByRecordedOwner").path("SYSTEM_COMPLETION").path("SHOP.CHECKOUT_SUBMITTED").asInt()).isEqualTo(1);
  assertThat(r.path("requirements").get(0).path("objectives").get(0).path("productId").asString()).isEqualTo("apple");
  assertThat(r.path("terminalRecords").get(0).path("paid").asBoolean()).isFalse();
  assertThat(r.toString()).doesNotContain("SUCCESS","FAILURE","practicePlan");assertThat(input).isEqualTo(before);
 }
 @Test void preservesPartialScopeReachedQuantityAndUnknownOwnerWithoutBorrowingPreviousSession() {
  var input=m.readTree("""
  {"sessions":[{"sessionId":"old","events":[{"sequence":1,"action":{"eventCode":"SHOP.REPLAY_CONTEXT_CHANGED"},"payload":{"marketContent":{"replayExecutionContext":{"executionOwner":"SYSTEM_COMPLETION"}}}}]},
   {"sessionId":"current","integrity":{"status":"PARTIAL","missingEventCount":2},"events":[
    {"sequence":3,"action":{"eventCode":"SHOP.QUANTITY_CHANGED"},"payload":{"itemId":"milk","quantityBefore":0,"quantityAfter":2}},
    {"sequence":4,"action":{"eventCode":"SHOP.QUANTITY_CHANGED"},"payload":{"itemId":"milk","quantityBefore":2,"quantityAfter":0}},
    {"sequence":5,"action":{"eventCode":"SHOP.SESSION_ENDED"},"sessionEnd":{"reason":"USER_ABORTED"}}
  ]}]}
  """);
  var r=SessionSourceLedger.build(m,input).get(1);var q=r.path("quantityRanges").path("milk");
  assertThat(q.path("afterValueCounts").path("2").asInt()).isEqualTo(1);
  assertThat(q.path("min").asDouble()).isZero();assertThat(q.path("max").asDouble()).isEqualTo(2);
  assertThat(r.path("countsByRecordedOwner").has("SYSTEM_COMPLETION")).isFalse();
  assertThat(r.path("countsByRecordedOwner").path("UNRECORDED").path("SHOP.QUANTITY_CHANGED").asInt()).isEqualTo(2);
  assertThat(r.path("integrity").path("missingEventCount").asInt()).isEqualTo(2);
  assertThat(r.path("terminalRecords").get(0).has("timing")).isFalse();
  assertThat(r.path("eventCounts").path("SHOP.CHECKOUT_SUBMITTED").asInt()).isZero();
 }
 @Test void synthesisReviewAndHistoryCarrySameSessionFactsWithoutRemovingOriginalSource() {
  var mapper=JsonMapper.builder().findAndAddModules().build();
  var fixture=new MovementProjectionTest();var input=fixture.input(fixture.fixture());
  var factory=new oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisPromptFactory(mapper);
  var refs=new oneuldo.behaviorlog.analysis.service.AnalysisReferences(mapper,input);
  String source=oneuldo.behaviorlog.analysis.service.AnalysisSynthesisPrompt.build(mapper,factory,input,java.util.List.of(),refs,false);
  var codec=new oneuldo.behaviorlog.analysis.service.FinalSourceEncoding(mapper);
  var decoded=codec.decode(mapper.readTree(source));
  var review=codec.decode(mapper.readTree(oneuldo.behaviorlog.analysis.service.AnalysisReviewPrompt.build(mapper,source,null,refs)));
  assertThat(review.path(SessionSourceLedger.FIELD)).isEqualTo(decoded.path(SessionSourceLedger.FIELD));
  assertThat(review.path(SessionSourceLedger.FIELD).size()).isEqualTo(input.sessionCount());
  assertThat(review.has("sourceEventDetails")).isTrue();
  var session=input.input().sessions().getFirst();
  var history=oneuldo.behaviorlog.personalization.service.PracticeHistoryService.project(mapper,input,session.sessionId());
  assertThat(history.has(SessionSourceLedger.FIELD)).isFalse(); // Shared quest history stays unchanged.
 }

}
