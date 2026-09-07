package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import java.time.Instant;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import jakarta.annotation.PreDestroy;

/** Durable queue with per-job leases; a single local worker shares the provider quota. */
@Service
public class AnalysisJobService {
    public record Job(UUID id,UUID sessionId,UUID datasetId,String status,String stage,int completed,int total,
            Instant waitUntil,UUID analysisId,String errorCode,Instant createdAt,Instant updatedAt) {}
    private final JdbcTemplate db;
    private final BehaviorAnalysisInputService inputs;
    private final AiBehaviorAnalysisService analyses;
    private final oneuldo.behaviorlog.profile.service.AiUserProfileService profiles;
    private final oneuldo.behaviorlog.repository.BehaviorLogRepository logs;
    private final UUID owner=UUID.randomUUID();
    private final AtomicBoolean busy=new AtomicBoolean();
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(AnalysisJobService.class);
    private final ExecutorService worker=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"analysis-job-worker");t.setDaemon(true);return t;});
    private final ScheduledExecutorService heartbeat=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"analysis-job-heartbeat");t.setDaemon(true);return t;});
    @Value("${ai.analysis-jobs.enabled:false}") private boolean enabled;
    public AnalysisJobService(JdbcTemplate db,BehaviorAnalysisInputService inputs,AiBehaviorAnalysisService analyses,
            oneuldo.behaviorlog.profile.service.AiUserProfileService profiles,oneuldo.behaviorlog.repository.BehaviorLogRepository logs) {
        this.db=db;this.inputs=inputs;this.analyses=analyses;this.profiles=profiles;this.logs=logs;
    }
    public Job enqueueLatest(UUID member) {
        var ids=logs.findLatestCompletedSessionIds(member,org.springframework.data.domain.PageRequest.of(0,1));
        if(ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"완료된 플레이가 없습니다.");
        return enqueue(member,ids.getFirst());
    }
    public synchronized Job enqueue(UUID member,UUID session) {
        var snapshot=inputs.createForSession(member,null,session); // ownership checked; fixed input survives restarts
        var existing=query("SELECT * FROM ai_analysis_jobs WHERE member_id=? AND session_id=? AND dataset_id=? AND (status IN ('QUEUED','RUNNING') OR (status='READY' AND prompt_version=?)) ORDER BY created_at DESC LIMIT 1",
                member,session,snapshot.id(),AiBehaviorAnalysisPromptFactory.VERSION);
        if(!existing.isEmpty()) return existing.getFirst();
        UUID id=UUID.randomUUID();
        db.update("INSERT INTO ai_analysis_jobs(id,member_id,session_id,dataset_id,prompt_version,status,stage) VALUES(?,?,?,?,?,'QUEUED','QUEUED') ON CONFLICT DO NOTHING",id,member,session,snapshot.id(),AiBehaviorAnalysisPromptFactory.VERSION);
        return query("SELECT * FROM ai_analysis_jobs WHERE member_id=? AND session_id=? AND dataset_id=? AND status IN ('QUEUED','RUNNING') ORDER BY created_at DESC LIMIT 1",member,session,snapshot.id()).getFirst();
    }
    public Job current(UUID member) {
        var rows=query("SELECT * FROM ai_analysis_jobs WHERE member_id=? ORDER BY CASE WHEN status IN ('QUEUED','RUNNING') THEN 0 ELSE 1 END, created_at DESC LIMIT 1",member);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public Job find(UUID member,UUID id) {
        var rows=query("SELECT * FROM ai_analysis_jobs WHERE member_id=? AND id=?",member,id);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);return rows.getFirst();
    }
    @Scheduled(fixedDelay=1000)
    public void dispatch() {
        if(!enabled || !busy.compareAndSet(false,true))return;
        try {worker.submit(()->{try {executeNext();} catch(Exception failure) {log.error("Analysis worker dispatch failed: {}",failure.getClass().getSimpleName());} finally {busy.set(false);}});}
        catch(RejectedExecutionException stopped){busy.set(false);}
    }
    private void executeNext() {
        db.update("UPDATE ai_analysis_jobs SET status=CASE WHEN starts>=3 THEN 'FAILED' ELSE 'QUEUED' END,stage='RECOVERING',error_code=CASE WHEN starts>=3 THEN 'WORKER_INTERRUPTED' ELSE NULL END,owner_id=NULL,wait_until=NULL,updated_at=now() WHERE status='RUNNING' AND lease_until<now()");
        var claimed=query("UPDATE ai_analysis_jobs SET status='RUNNING',stage='PREPARING',owner_id=?,lease_until=now()+interval '45 seconds',starts=starts+1,wait_until=NULL,updated_at=now() WHERE id=(SELECT id FROM ai_analysis_jobs WHERE status='QUEUED' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",owner);
        if(claimed.isEmpty())return;
        Job job=claimed.getFirst();
        UUID member=db.queryForObject("SELECT member_id FROM ai_analysis_jobs WHERE id=?",UUID.class,job.id());
        var pulse=heartbeat.scheduleAtFixedRate(()->db.update("UPDATE ai_analysis_jobs SET lease_until=now()+interval '45 seconds' WHERE id=? AND owner_id=? AND status='RUNNING'",job.id(),owner),10,10,TimeUnit.SECONDS);
        try(var reporting=AnalysisProgress.bind(update->{
            int changed=db.update("UPDATE ai_analysis_jobs SET stage=coalesce(?,stage),completed=coalesce(?,completed),total=coalesce(?,total),wait_until=?,updated_at=now() WHERE id=? AND owner_id=? AND status='RUNNING'",
                update.stage(),update.completed(),update.total(),update.waitUntil()==null||update.waitUntil()==0?null:java.sql.Timestamp.from(Instant.ofEpochMilli(update.waitUntil())),job.id(),owner);
            if(changed!=1)throw new IllegalStateException("JOB_LEASE_LOST");
        })) {
            var result=analyses.analyzeSnapshot(member,job.datasetId());
            if(Thread.currentThread().isInterrupted())throw new InterruptedException();
            if(!"READY".equals(result.status())) {finish(job,"FAILED",result.analysisId(),result.errorCode());return;}
            db.update("UPDATE ai_analysis_jobs SET analysis_id=? WHERE id=? AND owner_id=?",result.analysisId(),job.id(),owner);
            var progress=find(member,job.id());
            AnalysisProgress.stage("PROFILE",progress.completed(),progress.total());
            var profile=profiles.updateFromSession(member,job.sessionId(),result);
            if(Thread.currentThread().isInterrupted())throw new InterruptedException();
            finish(job,"READY".equals(profile.status())?"READY":"FAILED",result.analysisId(),"READY".equals(profile.status())?null:"PROFILE_UPDATE_FAILED");
        } catch(Exception failure) {
            if(Thread.currentThread().isInterrupted()) {
                db.update("UPDATE ai_analysis_jobs SET status='QUEUED',stage='RECOVERING',owner_id=NULL,lease_until=NULL,wait_until=NULL,updated_at=now() WHERE id=? AND owner_id=? AND status='RUNNING'",job.id(),owner);
            } else finish(job,"FAILED",null,"WORKER_FAILED");
        }
        finally {pulse.cancel(false);}
    }
    private void finish(Job job,String status,UUID analysis,String error) {
        db.update("UPDATE ai_analysis_jobs SET status=?,stage=?,analysis_id=coalesce(?,analysis_id),error_code=?,wait_until=NULL,lease_until=NULL,updated_at=now() WHERE id=? AND owner_id=? AND status='RUNNING'",
                status,status,analysis,error,job.id(),owner);
    }
    private List<Job> query(String sql,Object...args) {
        return db.query(sql,(r,n)->new Job(r.getObject("id",UUID.class),r.getObject("session_id",UUID.class),r.getObject("dataset_id",UUID.class),r.getString("status"),r.getString("stage"),r.getInt("completed"),r.getInt("total"),r.getTimestamp("wait_until")==null?null:r.getTimestamp("wait_until").toInstant(),r.getObject("analysis_id",UUID.class),r.getString("error_code"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant()),args);
    }
    @PreDestroy public void close(){worker.shutdownNow();heartbeat.shutdownNow();}
}
