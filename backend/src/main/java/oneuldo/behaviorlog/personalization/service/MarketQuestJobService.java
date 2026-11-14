package oneuldo.behaviorlog.personalization.service;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;
import oneuldo.ai.client.AiOperationDeadline;
import oneuldo.behaviorlog.personalization.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/** Authenticated, bounded jobs share identical in-flight requests and expose real server stages. */
@Service
public class MarketQuestJobService {
    public record Status(UUID jobId,String status,String stage,long elapsedMs,int deadlineSeconds,String errorCode,MarketAiQuestResponse result) {}
    private static final class Job {
        final UUID id=UUID.randomUUID(),member;final String key;final Instant start=Instant.now();
        Instant end;String state="RUNNING",stage="QUEUED",error;MarketAiQuestResponse result;Future<?> future;
        Job(UUID member,String key){this.member=member;this.key=key;}
        synchronized void stage(String value){if(state.equals("RUNNING"))stage=value;}
        synchronized void finish(MarketAiQuestResponse value){if(state.equals("RUNNING")){result=value;state="READY";stage="READY";end=Instant.now();}}
        synchronized void fail(String code){if(state.equals("RUNNING")){error=code;state="FAILED";stage="FAILED";end=Instant.now();}}
        synchronized Status status(){return new Status(id,state,stage,Duration.between(start,end==null?Instant.now():end).toMillis(),AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS,error,result);}
    }
    private final AdaptiveMarketQuestService service;private final MarketProfileFreshnessService freshness;private final ObjectMapper mapper;
    private final ConcurrentMap<UUID,Job> jobs=new ConcurrentHashMap<>();private final ConcurrentMap<String,Job> active=new ConcurrentHashMap<>();
    private final ExecutorService workers=Executors.newFixedThreadPool(2);private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
    public MarketQuestJobService(AdaptiveMarketQuestService service,MarketProfileFreshnessService freshness,ObjectMapper mapper){this.service=service;this.freshness=freshness;this.mapper=mapper;}
    public synchronized Status start(UUID member,MarketAiQuestRequest.EnvironmentContext context){
        var profile=freshness.requireCurrent(member);
        String key=member+":"+profile.profileId()+":"+mapper.writeValueAsString(context);
        var previous=active.get(key);if(previous!=null)return previous.status();
        jobs.values().removeIf(j->Duration.between(j.start,Instant.now()).toHours()>=1&&!j.status().status().equals("RUNNING"));
        if(active.size()>=4)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"QUEST_QUEUE_FULL");
        var job=new Job(member,key);jobs.put(job.id,job);active.put(key,job);
        var expiry=timer.schedule(()->{job.fail("QUEST_GENERATION_TIMEOUT");if(job.future!=null)job.future.cancel(true);active.remove(key,job);},AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS,TimeUnit.SECONDS);
        job.future=workers.submit(()->{
            try(var deadline=new AiOperationDeadline(Duration.ofMillis(Math.max(1,AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS*1000L-Duration.between(job.start,Instant.now()).toMillis())))){
                job.finish(service.generate(member,context,job::stage));
            }catch(RuntimeException failure){String code=failure instanceof ResponseStatusException e?e.getReason():failure.getMessage();job.fail(code==null?"AI_QUEST_FAILED":code);}
            finally{expiry.cancel(false);active.remove(key,job);}
        });return job.status();
    }
    public Status get(UUID member,UUID id){var job=jobs.get(id);if(job==null||!job.member.equals(member))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"QUEST_JOB_NOT_FOUND");return job.status();}
    public Status cancel(UUID member,UUID id){get(member,id);var j=jobs.get(id);j.fail("QUEST_GENERATION_CANCELLED");if(j.future!=null)j.future.cancel(true);active.remove(j.key,j);return j.status();}
    @PreDestroy void close(){workers.shutdownNow();timer.shutdownNow();}
}
