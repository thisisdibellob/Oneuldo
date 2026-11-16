package oneuldo.behaviorlog.personalization.service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Durable mirror of quest jobs. The running job still lives in its worker's memory; this row only records
 * who owns it, how far it got and how it ended, so another process (or the same one after a restart) can answer.
 * Off by default: enable with ai.quest-jobs.persistent=true once V39 is applied.
 */
@Component
public class MarketQuestJobStore {
    /** A worker renews its lease every 10 seconds; three missed renewals mean the worker is gone. */
    public static final Duration LEASE=Duration.ofSeconds(45);
    public record Row(UUID id,String status,String stage,String errorCode,UUID generationId,UUID ownerId,
            Instant leaseUntil,Instant createdAt,Instant finishedAt) {}
    private final JdbcTemplate db;
    private final boolean enabled;
    public MarketQuestJobStore(JdbcTemplate db,@Value("${ai.quest-jobs.persistent:false}") boolean enabled) {this.db=db;this.enabled=enabled;}
    public boolean enabled() {return enabled;}

    public void started(UUID id,UUID member,String requestKey,UUID owner,Instant now) {
        if(!enabled)return;
        db.update("INSERT INTO ai_quest_jobs(id,member_id,request_key,status,stage,owner_id,lease_until,created_at,updated_at) VALUES(?,?,?,'RUNNING','QUEUED',?,?,?,?)",
                id,member,requestKey,owner,at(now.plus(LEASE)),at(now),at(now));
    }
    public void stage(UUID id,UUID owner,String stage,Instant now) {
        if(!enabled)return;
        db.update("UPDATE ai_quest_jobs SET stage=?,lease_until=?,updated_at=? WHERE id=? AND owner_id=? AND status='RUNNING'",stage,at(now.plus(LEASE)),at(now),id,owner);
    }
    public void renew(UUID id,UUID owner,Instant now) {
        if(!enabled)return;
        db.update("UPDATE ai_quest_jobs SET lease_until=? WHERE id=? AND owner_id=? AND status='RUNNING'",at(now.plus(LEASE)),id,owner);
    }
    public void finished(UUID id,UUID owner,String status,String errorCode,UUID generationId,Instant now) {
        if(!enabled)return;
        db.update("UPDATE ai_quest_jobs SET status=?,stage=?,error_code=?,generation_id=?,finished_at=?,updated_at=? WHERE id=? AND owner_id=? AND status='RUNNING'",
                status,status,errorCode,generationId,at(now),at(now),id,owner);
    }
    /** A running row whose lease has lapsed has no worker any more: record that, once, as the outcome. */
    public void expire(UUID id,Instant now) {
        if(!enabled)return;
        db.update("UPDATE ai_quest_jobs SET status='FAILED',stage='FAILED',error_code='QUEST_WORKER_INTERRUPTED',finished_at=?,updated_at=? WHERE id=? AND status='RUNNING' AND lease_until<?",
                at(now),at(now),id,at(now));
    }
    public Optional<Row> find(UUID id,UUID member) {
        if(!enabled)return Optional.empty();
        return db.query("SELECT id,status,stage,error_code,generation_id,owner_id,lease_until,created_at,finished_at FROM ai_quest_jobs WHERE id=? AND member_id=?",
                (r,n)->new Row(r.getObject("id",UUID.class),r.getString("status"),r.getString("stage"),r.getString("error_code"),r.getObject("generation_id",UUID.class),
                        r.getObject("owner_id",UUID.class),instant(r.getTimestamp("lease_until")),instant(r.getTimestamp("created_at")),instant(r.getTimestamp("finished_at"))),id,member)
                .stream().findFirst();
    }
    private static Timestamp at(Instant value) {return Timestamp.from(value);}
    private static Instant instant(Timestamp value) {return value==null?null:value.toInstant();}
}
