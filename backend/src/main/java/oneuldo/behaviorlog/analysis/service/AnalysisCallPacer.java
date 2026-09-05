package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Shared process-local rolling-window reservations. Unknown account sublimits are not invented. */
@Component
public class AnalysisCallPacer {
    @Value("${ai.groq.tokens-per-minute:7000}") private int tpm=7000;
    @Value("${ai.groq.requests-per-minute:30}") private int rpm=30;
    @Value("${ai.groq.input-tokens-per-minute:0}") private int itpm;
    @Value("${ai.groq.output-tokens-per-minute:0}") private int otpm;
    private final LongSupplier clock;
    private final List<Reservation> entries=new ArrayList<>();
    private long blockedUntil;
    private int headerRemaining=Integer.MAX_VALUE;
    private long headerReset;
    public AnalysisCallPacer() { this(System::currentTimeMillis); }
    public AnalysisCallPacer(LongSupplier clock) { this.clock=clock; }
    public static final class Reservation {
        final long time; int input,output;
        Reservation(long time,int input,int output) {this.time=time;this.input=input;this.output=output;}
    }
    public synchronized long delayMillis(int input,int output) {
        if(tpm<1 || rpm<1 || itpm<0 || otpm<0 || input<0 || output<0) throw new IllegalArgumentException("INVALID_RATE_LIMIT_CONFIGURATION");
        long now=clock.getAsLong();entries.removeIf(e->e.time+61000<=now);
        if(input+output>tpm || (itpm>0 && input>itpm) || (otpm>0 && output>otpm))
            throw new IllegalArgumentException("REQUEST_EXCEEDS_RATE_CAPACITY");
        long until=blockedUntil;
        if(headerReset>now && input+output>headerRemaining) until=Math.max(until,headerReset);
        int in=input,out=output,count=1;
        for(var entry:entries) {in+=entry.input;out+=entry.output;count++;}
        for(var entry:entries) {
            if(in+out<=tpm && count<=rpm && (itpm<=0 || in<=itpm) && (otpm<=0 || out<=otpm)) break;
            until=Math.max(until,entry.time+61000);in-=entry.input;out-=entry.output;count--;
        }
        return Math.max(0,until-now);
    }
    public synchronized Reservation acquire(int input,int output) {
        long remaining;
        while((remaining=delayMillis(input,output))>0) {
            if(remaining>120000) throw new oneuldo.ai.exception.CloudAiRateLimitException(Long.toString((remaining+999)/1000),null);
            try {wait(Math.min(remaining,1000));}
            catch(InterruptedException interrupted) {Thread.currentThread().interrupt();throw new IllegalStateException("AI_REQUEST_INTERRUPTED");}
        }
        var entry=new Reservation(clock.getAsLong(),input,output);entries.add(entry);
        if(headerReset>entry.time) headerRemaining=Math.max(0,headerRemaining-input-output);
        return entry;
    }
    /** Actual requests are admitted at the shared HTTP client, not at pipeline/cache boundaries. */
    public void awaitTurn() {}
    public synchronized void completed(Reservation entry,Integer input,Integer output,Map<String,String> headers) {
        if(input!=null && input>=0) entry.input=input;
        if(output!=null && output>=0) entry.output=output;
        updateHeaders(headers);notifyAll();
    }
    public synchronized void limited(Map<String,String> headers,String body) {
        headers=normalized(headers);
        updateHeaders(headers);
        long retry=durationMillis(headers.get("retry-after"));
        blockedUntil=Math.max(blockedUntil,clock.getAsLong()+Math.max(1000,retry>0?retry:61000));
        String error=body.toLowerCase(Locale.ROOT);
        var match=java.util.regex.Pattern.compile("(?i)\\bLimit[:= ]+(\\d+)").matcher(body);
        if(match.find()) {
            int limit=Integer.parseInt(match.group(1));
            if(error.contains("output tokens per minute")) otpm=limit;
            else if(error.contains("input tokens per minute")) itpm=limit;
        }
        notifyAll();
    }
    private void updateHeaders(Map<String,String> headers) {
        headers=normalized(headers);
        try {
            String cap=headers.get("x-ratelimit-limit-tokens");if(cap!=null) tpm=Math.min(tpm,Integer.parseInt(cap));
            String remaining=headers.get("x-ratelimit-remaining-tokens");
            if(remaining!=null) {headerRemaining=Math.max(0,Integer.parseInt(remaining));headerReset=clock.getAsLong()+durationMillis(headers.get("x-ratelimit-reset-tokens"));}
            if("0".equals(headers.get("x-ratelimit-remaining-requests"))) blockedUntil=Math.max(blockedUntil,clock.getAsLong()+durationMillis(headers.get("x-ratelimit-reset-requests")));
        } catch(NumberFormatException ignored) { /* keep conservative reservations */ }
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
