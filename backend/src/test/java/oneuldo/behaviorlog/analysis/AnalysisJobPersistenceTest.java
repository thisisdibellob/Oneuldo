package oneuldo.behaviorlog.analysis;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.profile.service.AiUserProfileService;
import oneuldo.behaviorlog.profile.domain.AiUserProfileResponse;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Real Postgres semantics (ON CONFLICT / SKIP LOCKED), isolated throwaway schema. No cloud calls. */
@EnabledIfEnvironmentVariable(named="ANALYSIS_JOB_TEST_DB",matches=".+")
class AnalysisJobPersistenceTest {
    JdbcTemplate admin,db;String schema;AnalysisJobService jobs;
    UUID member=UUID.randomUUID(),session=UUID.randomUUID(),dataset=UUID.randomUUID(),analysis=UUID.randomUUID();
    AiBehaviorAnalysisService analyses=mock(AiBehaviorAnalysisService.class);
    @BeforeEach void setup() throws Exception {
        var ds=new DriverManagerDataSource(System.getenv("ANALYSIS_JOB_TEST_DB"),"oneuldo",System.getenv("DB_PASSWORD"));
        admin=new JdbcTemplate(ds);schema="analysis_job_test_"+UUID.randomUUID().toString().replace("-","");
        admin.execute("CREATE SCHEMA "+schema);
        var isolated=new DriverManagerDataSource(System.getenv("ANALYSIS_JOB_TEST_DB")+"?currentSchema="+schema,"oneuldo",System.getenv("DB_PASSWORD"));
        db=new JdbcTemplate(isolated);
        for(String table:List.of("member","behavior_analysis_input_snapshots","ai_behavior_analyses"))db.execute("CREATE TABLE "+table+"(id uuid PRIMARY KEY)");
        new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(new org.springframework.core.io.ClassPathResource("db/migration/V37__create_analysis_jobs.sql")).execute(isolated);
        db.update("INSERT INTO member VALUES(?)",member);db.update("INSERT INTO behavior_analysis_input_snapshots VALUES(?)",dataset);db.update("INSERT INTO ai_behavior_analyses VALUES(?)",analysis);
        var inputs=mock(BehaviorAnalysisInputService.class);var snapshot=mock(BehaviorAnalysisInputResponse.class);
        when(snapshot.id()).thenReturn(dataset);when(inputs.createForSession(member,null,session)).thenReturn(snapshot);
        var profileService=mock(AiUserProfileService.class);var profile=mock(AiUserProfileResponse.class);when(profile.status()).thenReturn("READY");
        when(profileService.updateFromSession(eq(member),eq(session),any())).thenReturn(profile);
        var response=mock(AiBehaviorAnalysisResponse.class);when(response.status()).thenReturn("READY");when(response.analysisId()).thenReturn(analysis);
        when(analyses.analyzeSnapshot(member,dataset)).thenAnswer(inv->{AnalysisProgress.stage("OBSERVING",1,2);AnalysisProgress.waiting(System.currentTimeMillis()+5000);return response;});
        jobs=new AnalysisJobService(db,inputs,analyses,profileService,mock(BehaviorLogRepository.class));
    }
    @AfterEach void cleanup() {if(jobs!=null)jobs.close();if(schema!=null&&schema.matches("analysis_job_test_[a-f0-9]{32}"))admin.execute("DROP SCHEMA "+schema+" CASCADE");}
    @Test void deduplicates_owned_jobs_and_persists_terminal_result() {
        var first=jobs.enqueue(member,session);assertThat(jobs.enqueue(member,session).id()).isEqualTo(first.id());
        assertThatThrownBy(()->jobs.find(UUID.randomUUID(),first.id())).isInstanceOf(ResponseStatusException.class);
        ReflectionTestUtils.invokeMethod(jobs,"executeNext");
        var ready=jobs.find(member,first.id());assertThat(ready.status()).isEqualTo("READY");assertThat(ready.analysisId()).isEqualTo(analysis);
        assertThat(ready.completed()).isEqualTo(1);assertThat(ready.waitUntil()).isNull();
        assertThat(jobs.enqueue(member,session).id()).isEqualTo(first.id());
        verify(analyses,times(1)).analyzeSnapshot(member,dataset);
    }
    @Test void expired_worker_reuses_fixed_snapshot_and_recovers() {
        var first=jobs.enqueue(member,session);
        db.update("UPDATE ai_analysis_jobs SET status='RUNNING',starts=1,owner_id=?,lease_until=now()-interval '1 minute' WHERE id=?",UUID.randomUUID(),first.id());
        ReflectionTestUtils.invokeMethod(jobs,"executeNext");
        assertThat(jobs.find(member,first.id()).status()).isEqualTo("READY");verify(analyses).analyzeSnapshot(member,dataset);
    }
}
