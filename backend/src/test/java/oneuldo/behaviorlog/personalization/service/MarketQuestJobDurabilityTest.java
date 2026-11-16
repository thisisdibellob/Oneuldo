package oneuldo.behaviorlog.personalization.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestResponse;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.json.JsonMapper;

/** The stored job row answers for a job after the process that ran it is gone. Uses the real V39 table definition. */
class MarketQuestJobDurabilityTest {
    final JsonMapper mapper=JsonMapper.builder().build();
    JdbcTemplate db;UUID member=UUID.randomUUID(),generation=UUID.randomUUID();
    AdaptiveMarketQuestService service=mock(AdaptiveMarketQuestService.class);
    MarketProfileFreshnessService freshness=mock(MarketProfileFreshnessService.class);
    MarketAiQuestAuditService generations=mock(MarketAiQuestAuditService.class);
    MarketAiQuestResponse quest=new MarketAiQuestResponse(generation,UUID.randomUUID(),UUID.randomUUID(),"AI","model",1L,"AI_PROFILE","v",null,"요약",List.of());
    final List<MarketQuestJobService> started=new ArrayList<>();

    static final String GUARD=",\n CONSTRAINT ck_quest_job_status CHECK(status IN ('RUNNING','READY','FAILED'))";
    @BeforeEach void setup() throws Exception {
        var source=new DriverManagerDataSource("jdbc:h2:mem:questjobs_"+UUID.randomUUID().toString().replace("-","")+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(source);db.execute("CREATE TABLE member(id uuid PRIMARY KEY)");db.update("INSERT INTO member VALUES(?)",member);
        // The in-memory test database rejects every row of a table that has any CHECK constraint, so the status
        // guard line of the real definition is left out here. All other columns, types and the index are V39 as written.
        String ddl=new String(new ClassPathResource("db/migration/V39__create_quest_jobs.sql").getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
        assertThat(ddl).contains(GUARD);
        for(String statement:ddl.replace(GUARD,"").replaceAll("(?m)^--.*$","").split(";"))if(!statement.isBlank())db.execute(statement);
        var profile=mock(AiUserProfileResponse.class);when(profile.profileId()).thenReturn(UUID.randomUUID());when(freshness.requireCurrent(any())).thenReturn(profile);
        when(generations.findGeneration(member,generation)).thenReturn(Optional.of(quest));
    }
    @AfterEach void stop() {started.forEach(MarketQuestJobService::close);}
    MarketQuestJobService process(boolean durable) {
        var jobs=new MarketQuestJobService(service,freshness,mapper);jobs.setDurableStore(new MarketQuestJobStore(db,durable),generations);started.add(jobs);return jobs;
    }
    MarketQuestJobService.Status await(MarketQuestJobService jobs,UUID id) throws Exception {
        for(int n=0;n<200;n++){var status=jobs.get(member,id);if(!"RUNNING".equals(status.status()))return status;Thread.sleep(10);}
        throw new AssertionError("job did not finish");
    }

    @Test void a_finished_job_is_answered_with_its_quest_by_another_process() throws Exception {
        when(service.generate(any(),any(),any())).thenAnswer(call->{call.<java.util.function.Consumer<String>>getArgument(2).accept("GENERATING");return quest;});
        var first=process(true);var job=first.start(member,null);
        assertThat(await(first,job.jobId()).status()).isEqualTo("READY");
        assertThat(db.queryForObject("SELECT status FROM ai_quest_jobs WHERE id=?",String.class,job.jobId())).isEqualTo("READY");
        assertThat(db.queryForObject("SELECT generation_id FROM ai_quest_jobs WHERE id=?",UUID.class,job.jobId())).isEqualTo(generation);

        var afterRestart=process(true).get(member,job.jobId());
        assertThat(afterRestart.status()).isEqualTo("READY");assertThat(afterRestart.result()).isEqualTo(quest);
        assertThat(afterRestart.jobId()).isEqualTo(job.jobId());
        assertThatThrownBy(()->process(true).get(UUID.randomUUID(),job.jobId())).hasMessageContaining("404");
    }

    @Test void a_job_whose_worker_disappeared_is_reported_as_interrupted_not_missing() throws Exception {
        var entered=new CountDownLatch(1);var released=new CountDownLatch(1);
        when(service.generate(any(),any(),any())).thenAnswer(call->{call.<java.util.function.Consumer<String>>getArgument(2).accept("ANALYZING_MOVEMENT");entered.countDown();released.await();return quest;});
        var first=process(true);var job=first.start(member,null);
        try {
            assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
            assertThat(db.queryForObject("SELECT stage FROM ai_quest_jobs WHERE id=?",String.class,job.jobId())).isEqualTo("ANALYZING_MOVEMENT");
            var other=process(true);
            // While the lease is current another process reports the stored stage and cannot cancel it.
            assertThat(other.get(member,job.jobId()).status()).isEqualTo("RUNNING");
            assertThat(other.cancel(member,job.jobId()).stage()).isEqualTo("ANALYZING_MOVEMENT");
            // The worker stops renewing: after the lease the stored outcome becomes an interruption.
            db.update("UPDATE ai_quest_jobs SET lease_until=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(1)),job.jobId());
            var lost=other.get(member,job.jobId());
            assertThat(lost.status()).isEqualTo("FAILED");assertThat(lost.errorCode()).isEqualTo("QUEST_WORKER_INTERRUPTED");assertThat(lost.result()).isNull();
            assertThat(db.queryForObject("SELECT status FROM ai_quest_jobs WHERE id=?",String.class,job.jobId())).isEqualTo("FAILED");
        } finally {released.countDown();}
    }

    @Test void a_ready_row_without_a_readable_quest_is_not_reported_as_ready() throws Exception {
        when(service.generate(any(),any(),any())).thenReturn(quest);
        var first=process(true);var job=first.start(member,null);await(first,job.jobId());
        when(generations.findGeneration(member,generation)).thenReturn(Optional.empty());
        var status=process(true).get(member,job.jobId());
        assertThat(status.status()).isEqualTo("FAILED");assertThat(status.errorCode()).isEqualTo("QUEST_RESULT_UNAVAILABLE");
    }

    @Test void with_the_store_switched_off_nothing_is_written_and_unknown_jobs_stay_missing() throws Exception {
        when(service.generate(any(),any(),any())).thenReturn(quest);
        var first=process(false);var job=first.start(member,null);
        assertThat(await(first,job.jobId()).status()).isEqualTo("READY");
        assertThat(db.queryForObject("SELECT count(*) FROM ai_quest_jobs",Integer.class)).isZero();
        assertThatThrownBy(()->process(false).get(member,job.jobId())).hasMessageContaining("404");
    }
}
