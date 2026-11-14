package oneuldo.ai.client;
import java.util.*;import org.junit.jupiter.api.Test;import static org.assertj.core.api.Assertions.*;
class SourceOutputSchemasTest {
 @Test void only_known_structures_with_bounded_aliases_are_accepted() {
  var digest=SourceOutputSchemas.digest(Set.of("E2","E1"));var adaptive=SourceOutputSchemas.adaptive(Set.of("E1","E55"));
  assertThat(SourceOutputSchemas.allowed(digest)).isTrue();assertThat(SourceOutputSchemas.allowed(adaptive)).isTrue();
  assertThat(digest.at("/properties/observations/items/properties/evidenceEventIds/items/enum").get(0).asString()).isEqualTo("E1");
  digest.put("additionalProperties",true);assertThat(SourceOutputSchemas.allowed(digest)).isFalse();
  adaptive.put("$ref","https://untrusted.invalid/schema");assertThat(SourceOutputSchemas.allowed(adaptive)).isFalse();
  assertThatThrownBy(()->SourceOutputSchemas.digest(Set.of("UNKNOWN"))).hasMessage("INVALID_SOURCE_SCHEMA_ID");
 }
 @Test void quest_review_paths_and_original_ids_cannot_be_expanded_by_the_caller() {
  var review=SourceOutputSchemas.questReview(Set.of("E1","E2336"));assertThat(SourceOutputSchemas.allowed(review)).isTrue();
  assertThat(review.at("/properties/issues/items/properties/path/enum").toString()).doesNotContain("/changeReasons/1");
  ((tools.jackson.databind.node.ArrayNode)review.at("/properties/issues/items/properties/path/enum")).add("/nonexistent");
  assertThat(SourceOutputSchemas.allowed(review)).isFalse();
 }
 @Test void parallel_calls_and_repairs_share_one_real_request_budget() throws Exception {
  var calls=new java.util.concurrent.atomic.AtomicInteger();GroqChatClient delegate=new GroqChatClient(){public GroqChatResult complete(String s,String p){calls.incrementAndGet();return new GroqChatResult("{}","test");}};
  var budget=new InferenceBudgetClient(delegate,()->2);
  try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)){var a=pool.submit(()->budget.complete("s","p"));var b=pool.submit(()->budget.completeStructured("s","p",10,0,Map.of()));a.get();b.get();}
  assertThatThrownBy(()->budget.completeDigest("s","p",10,0)).hasMessage("TOTAL_CALL_BUDGET_EXCEEDED");assertThat(calls.get()).isEqualTo(2);
 }
}
