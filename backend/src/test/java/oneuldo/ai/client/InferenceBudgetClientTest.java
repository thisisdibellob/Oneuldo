package oneuldo.ai.client;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class InferenceBudgetClientTest {
 @Test void preservesNegotiatedSchemaCapabilitiesAndCallBudget() {
  var delegate=mock(GroqChatClient.class);
  when(delegate.supportsSourceSchemas()).thenReturn(true);
  when(delegate.supportsCompactSourceSchemas()).thenReturn(true);
  when(delegate.supportsConcretePracticeSchemas()).thenReturn(true);
  when(delegate.supportsCitationPoolSchemas()).thenReturn(true);
  var bounded=new InferenceBudgetClient(delegate,()->1);
  assertThat(bounded.supportsSourceSchemas()).isTrue();
  assertThat(bounded.supportsCompactSourceSchemas()).isTrue();
  assertThat(bounded.supportsConcretePracticeSchemas()).isTrue();
  assertThat(bounded.supportsCitationPoolSchemas()).isTrue();
  assertThat(bounded.actualCalls()).isZero();
  bounded.completeStructured("s","p",100,0,null);
  assertThat(bounded.actualCalls()).isEqualTo(1);
  assertThatThrownBy(()->bounded.complete("s","p")).hasMessage("TOTAL_CALL_BUDGET_EXCEEDED");
  verify(delegate,times(1)).completeStructured("s","p",100,0,null);
 }
 @Test void keepsOlderGatewayFallback() {
  var delegate=mock(GroqChatClient.class);
  assertThat(new InferenceBudgetClient(delegate,()->1).supportsCitationPoolSchemas()).isFalse();
 }
}
