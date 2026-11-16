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

/**
 * Authenticated, bounded jobs share identical in-flight requests and expose real server stages.
 * With a durable store, a job's stage and outcome also survive this process: a status request after a restart
 * returns the stored result or a recorded interruption instead of 404.
 */
@Service
public class MarketQuestJobService {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(MarketQuestJobService.class);
    public record Status(UUID jobId,String status,String stage,long elapsedMs,int deadlineSeconds,String errorCode,MarketAiQuestResponse result) {}
    private final class Job {
        final UUID id=UUID.randomUUID(),member;final String key;final Instant start=Instant.now();
        Instant end;String state="RUNNING",stage="QUEUED",error;MarketAiQuestResponse result;Future<?> future;
        Job(UUID member,String key){this.member=member;this.key=key;}
        synchronized void stage(String value){if(state.equals("RUNNING")){stage=value;durable(()->store.stage(id,owner,value,Instant.now()));}}
        synchronized void finish(MarketAiQuestResponse value){if(state.equals("RUNNING")){result=value;state="READY";stage="READY";end=Instant.now();
            durable(()->store.finished(id,owner,"READY",null,value==null?null:value.generationId(),end));}}
        synchronized void fail(String code){if(state.equals("RUNNING")){error=code;state="FAILED";stage="FAILED";end=Instant.now();
            durable(()->store.finished(id,owner,"FAILED",code.length()>100?code.substring(0,100):code,null,end));}}
        synchronized Status status(){return new Status(id,state,stage,Duration.between(start,end==null?Instant.now():end).toMillis(),AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS,error,result);}
    }
    private final AdaptiveMarketQuestService service;private final MarketProfileFreshnessService freshness;private final ObjectMapper mapper;
    private final ConcurrentMap<UUID,Job> jobs=new ConcurrentHashMap<>();private final ConcurrentMap<String,Job> active=new ConcurrentHashMap<>();
    private final ExecutorService workers=Executors.newFixedThreadPool(2);private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
    private final UUID owner=UUID.randomUUID();
    private MarketQuestJobStore store;private MarketAiQuestAuditService generations;
    public MarketQuestJobService(AdaptiveMarketQuestService service,MarketProfileFreshnessService freshness,ObjectMapper mapper){this.service=service;this.freshness=freshness;this.mapper=mapper;}
    /** Optional: without a store, or with it switched off, jobs live in this process only, as before. */
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    public synchronized void setDurableStore(MarketQuestJobStore store,MarketAiQuestAuditService generations) {
        if(store==null||!store.enabled()||this.store!=null)return;
        this.store=store;this.generations=generations;
        timer.scheduleAtFixedRate(()->{for(var job:active.values())durable(()->this.store.renew(job.id,owner,Instant.now()));},10,10,TimeUnit.SECONDS);
    }
    /** The record is a mirror: a storage fault must not stop or fail the generation that is running in memory. */
    private void durable(Runnable write) {
        if(store==null)return;
        try{write.run();}catch(RuntimeException failure){log.warn("Quest job record not written: {}",failure.getClass().getSimpleName());}
    }
    public synchronized Status start(UUID member,MarketAiQuestRequest.EnvironmentContext context){
        var profile=freshness.requireCurrent(member);
        String key=member+":"+profile.profileId()+":"+mapper.writeValueAsString(context);
        var previous=active.get(key);if(previous!=null)return previous.status();
        jobs.values().removeIf(j->Duration.between(j.start,Instant.now()).toHours()>=1&&!j.status().status().equals("RUNNING"));
        if(active.size()>=4)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"QUEST_QUEUE_FULL");
        var job=new Job(member,key);jobs.put(job.id,job);active.put(key,job);
        durable(()->store.started(job.id,member,oneuldo.behaviorlog.analysis.service.QwenTokenCounter.textHash(key),owner,job.start));
        var expiry=timer.schedule(()->{job.fail("QUEST_GENERATION_TIMEOUT");if(job.future!=null)job.future.cancel(true);active.remove(key,job);},AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS,TimeUnit.SECONDS);
        job.future=workers.submit(()->{
            try(var deadline=new AiOperationDeadline(Duration.ofMillis(Math.max(1,AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS*1000L-Duration.between(job.start,Instant.now()).toMillis())))){
                job.finish(service.generate(member,context,job::stage));
            }catch(RuntimeException failure){String code=failure instanceof ResponseStatusException e?e.getReason():failure.getMessage();job.fail(code==null?"AI_QUEST_FAILED":code);}
            finally{expiry.cancel(false);active.remove(key,job);}
        });return job.status();
    }
    public Status get(UUID member,UUID id){
        var job=jobs.get(id);
        if(job!=null){if(!job.member.equals(member))throw notFound();return job.status();}
        if(store==null)throw notFound();
        var now=Instant.now();var stored=store.find(id,member).orElseThrow(MarketQuestJobService::notFound);
        boolean lapsed="RUNNING".equals(stored.status())&&stored.leaseUntil().isBefore(now);
        if(lapsed)store.expire(id,now);
        var row=lapsed?store.find(id,member).orElseThrow(MarketQuestJobService::notFound):stored;
        long elapsed=Duration.between(row.createdAt(),row.finishedAt()==null?now:row.finishedAt()).toMillis();
        int deadline=AdaptiveQuestContract.GENERATION_DEADLINE_SECONDS;
        if(!"READY".equals(row.status()))return new Status(row.id(),row.status(),row.stage(),elapsed,deadline,row.errorCode(),null);
        var result=generations==null?Optional.<MarketAiQuestResponse>empty():generations.findGeneration(member,row.generationId());
        // A finished job whose quest record cannot be read is reported as such, never as a ready job without a quest.
        return result.map(quest->new Status(row.id(),"READY","READY",elapsed,deadline,null,quest))
                .orElseGet(()->new Status(row.id(),"FAILED","FAILED",elapsed,deadline,"QUEST_RESULT_UNAVAILABLE",null));
    }
    public Status cancel(UUID member,UUID id){
        var status=get(member,id);var j=jobs.get(id);
        // Only the process that runs a job can stop it; elsewhere the stored status is the answer.
        if(j==null)return status;
        j.fail("QUEST_GENERATION_CANCELLED");if(j.future!=null)j.future.cancel(true);active.remove(j.key,j);return j.status();
    }
    private static ResponseStatusException notFound(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"QUEST_JOB_NOT_FOUND");}
    @PreDestroy void close(){workers.shutdownNow();timer.shutdownNow();}
}
