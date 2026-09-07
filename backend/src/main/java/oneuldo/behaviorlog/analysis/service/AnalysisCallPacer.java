package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Shared cooldown triggered only by an actual provider 429 response. */
@Component
public class AnalysisCallPacer {
    @Value("${ai.groq.tokens-per-minute:7000}") private int tpm=7000;
    @Value("${ai.groq.requests-per-minute:30}") private int rpm=30;
    @Value("${ai.groq.input-tokens-per-minute:0}") private int itpm;
    @Value("${ai.groq.output-tokens-per-minute:0}") private int otpm;
    private final LongSupplier clock;
    private long blockedUntil;
    public AnalysisCallPacer() { this(System::currentTimeMillis); }
    public AnalysisCallPacer(LongSupplier clock) { this.clock=clock; }
    public static final class Reservation {
        final long time; int input,output;
        Reservation(long time,int input,int output) {this.time=time;this.input=input;this.output=output;}
    }
    public synchronized long delayMillis(int input,int output) {
        if(tpm<1 || rpm<1 || itpm<0 || otpm<0 || input<0 || output<0) throw new IllegalArgumentException("INVALID_RATE_LIMIT_CONFIGURATION");
        return Math.max(0,blockedUntil-clock.getAsLong());
    }

    public synchronized Reservation acquire(int input,int output) {
        long remaining;
        while((remaining=delayMillis(input,output))>0) {
            AnalysisProgress.waiting(clock.getAsLong()+remaining);
            if(remaining>120000) throw new oneuldo.ai.exception.CloudAiRateLimitException(Long.toString((remaining+999)/1000),null);
            try {wait(Math.min(remaining,1000));}
            catch(InterruptedException interrupted) {Thread.currentThread().interrupt();throw new IllegalStateException("AI_REQUEST_INTERRUPTED");}
        }
        AnalysisProgress.waiting(0);
        var entry=new Reservation(clock.getAsLong(),input,output);
        return entry;
    }
    /** Actual requests are admitted at the shared HTTP client, not at pipeline/cache boundaries. */
    public void awaitTurn() {}
    public synchronized void completed(Reservation entry,Integer input,Integer output,Map<String,String> headers) {
        // Successful responses never schedule a speculative wait.
    }
    public synchronized void limited(Map<String,String> headers,String body) {
        headers=normalized(headers);
        long retry=durationMillis(headers.get("retry-after"));
        if(retry<=0 && headers.get("retry-after")!=null) {
            try { retry=java.time.ZonedDateTime.parse(headers.get("retry-after"),java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()-clock.getAsLong(); }
            catch(java.time.format.DateTimeParseException ignored) {}
        }
        if(retry<=0) {
            var hint=java.util.regex.Pattern.compile("(?i)try again in ([0-9]+(?:[.][0-9]+)?(?:ms|s|m|h)(?:[0-9]+(?:[.][0-9]+)?(?:ms|s|m|h))*)").matcher(body);
            if(hint.find()) retry=durationMillis(hint.group(1));
        }
        if(retry<=0) retry=Math.max(durationMillis(headers.get("x-ratelimit-reset-tokens")),durationMillis(headers.get("x-ratelimit-reset-requests")));
        blockedUntil=Math.max(blockedUntil,clock.getAsLong()+Math.max(1000,retry>0?retry:61000));
        notifyAll();
    }
    private static Map<String,String> normalized(Map<String,String> headers) {
        Map<String,String> result=new HashMap<>();headers.forEach((key,value)->result.put(key.toLowerCase(Locale.ROOT),value));return result;
    }
    public static long durationMillis(String value) {
        if(value==null) return 0;
        if(value.matches("[0-9]+(\\.[0-9]+)?")) return (long)(Double.parseDouble(value)*1000);
        var matcher=java.util.regex.Pattern.compile("([0-9]+(?:\\.[0-9]+)?)(ms|s|m|h)").matcher(value);
        double result=0;int end=0;
        while(matcher.find()) {if(matcher.start()!=end)return 0;end=matcher.end();result+=Double.parseDouble(matcher.group(1))*switch(matcher.group(2)){case "h"->3600000;case "m"->60000;case "s"->1000;default->1;};}
        return end==value.length()?(long)result:0;
    }
}
