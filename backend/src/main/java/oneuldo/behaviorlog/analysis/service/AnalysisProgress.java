package oneuldo.behaviorlog.analysis.service;
import java.util.function.Consumer;
/** Worker-local reporting; persisted by the job service, never global cross-user state. */
public final class AnalysisProgress {
    public record Update(String stage,Integer completed,Integer total,Long waitUntil) {}
    private static final ThreadLocal<Consumer<Update>> CURRENT=new ThreadLocal<>();
    public static AutoCloseable bind(Consumer<Update> sink) {CURRENT.set(sink);return CURRENT::remove;}
    public static void stage(String stage,int done,int total) {send(new Update(stage,done,total,0L));}
    public static void waiting(long until) {send(new Update(null,null,null,until));}
    private static void send(Update update) {var sink=CURRENT.get();if(sink!=null)sink.accept(update);}
}
