package oneuldo.ai.client;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;
/** One real-call budget shared by parallel children, repairs and final review. */
public final class InferenceBudgetClient implements GroqChatClient {
    private final GroqChatClient delegate;private final IntSupplier ceiling;private final AtomicInteger calls=new AtomicInteger();
    public InferenceBudgetClient(GroqChatClient delegate,IntSupplier ceiling){this.delegate=delegate;this.ceiling=ceiling;}
    private void reserve(){if(calls.incrementAndGet()>ceiling.getAsInt())throw new IllegalArgumentException("TOTAL_CALL_BUDGET_EXCEEDED");}
    public GroqChatResult complete(String s,String p){reserve();return delegate.complete(s,p);}
    public GroqChatResult complete(String s,String p,int o,double t){reserve();return delegate.complete(s,p,o,t);}
    public GroqChatResult completeDigest(String s,String p,int o,double t){reserve();return delegate.completeDigest(s,p,o,t);}
    public GroqChatResult completeStructured(String s,String p,int o,double t,Object schema){reserve();return delegate.completeStructured(s,p,o,t,schema);}
    public boolean supportsSourceSchemas(){return delegate.supportsSourceSchemas();}
    public boolean supportsCompactSourceSchemas(){return delegate.supportsCompactSourceSchemas();}
    public boolean supportsConcretePracticeSchemas(){return delegate.supportsConcretePracticeSchemas();}
    public boolean supportsGroundedCauseEnums(){return delegate.supportsGroundedCauseEnums();}
    public boolean supportsGroundedTextPatchSchemas(){return delegate.supportsGroundedTextPatchSchemas();}
    public boolean supportsCitationPoolSchemas(){return delegate.supportsCitationPoolSchemas();}
    public int maxConcurrency(){return delegate.maxConcurrency();}
    public int actualCalls(){return calls.get();}
}
