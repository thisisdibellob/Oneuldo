package oneuldo.behaviorlog.profile.service;

import java.nio.file.*;
import java.util.*;
import oneuldo.OneuldoApplication;
import oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisService;
import oneuldo.behaviorlog.analysis.service.BehaviorAnalysisInputService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

/** Opt-in continuation of a READY immutable snapshot in the named synthetic pilot DB only.
 * Runs the production profile service; never manufactures analyses, quests, or behavior logs.
 */
@EnabledIfEnvironmentVariable(named="PILOT_PROFILE_CONTINUE", matches="true")
class ClosedLoopPilotProfileLiveTest {
    @Test void ready_snapshot_continues_to_real_profile_without_replacing_its_input() throws Exception {
        var folder=Path.of("../output/closed-loop-pilot-20260929").toAbsolutePath().normalize();
        var settings=new Properties();
        try(var reader=Files.newBufferedReader(folder.resolve("application-pilot.properties"))) {settings.load(reader);}
        assertThat(settings.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://127.0.0.1:5432/oneuldo_pilot_20260929");
        String arm=Objects.requireNonNull(System.getenv("PILOT_ARM"));
        assertThat(arm).isIn("matched","control");
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var member=UUID.fromString(mapper.readTree(Files.readString(folder.resolve("accounts.json"))).path(arm).path("memberId").asString());
        var analysisId=UUID.fromString(Objects.requireNonNull(System.getenv("PILOT_ANALYSIS_ID")));
        try(var context=SpringApplication.run(OneuldoApplication.class,
                "--spring.profiles.active=ollama",
                "--spring.datasource.driver-class-name=org.postgresql.Driver",
                // Test-only entities are on this classpath; never create/drop or migrate pilot tables.
                "--spring.jpa.hibernate.ddl-auto=none", "--spring.flyway.enabled=false",
                "--spring.config.additional-location="+folder.resolve("application-pilot.properties").toUri(),
                "--server.port=0", "--ai.analysis-jobs.enabled=false", "--ai.ollama.base-url=http://127.0.0.1:18083")) {
            var db=context.getBean(JdbcTemplate.class);
            assertThat(db.queryForObject("SELECT current_database()",String.class)).isEqualTo("oneuldo_pilot_20260929");
            var analysis=context.getBean(AiBehaviorAnalysisService.class).find(member,analysisId);
            assertThat(analysis.status()).isEqualTo("READY");
            var input=context.getBean(BehaviorAnalysisInputService.class).find(member,analysis.datasetId());
            assertThat(input.input().sessions()).hasSize(1);
            var session=input.input().sessions().getFirst().sessionId();
            var latest=db.queryForObject("SELECT session_id FROM behavior_logs WHERE member_id=? AND event_code='SHOP.SESSION_ENDED' ORDER BY occurred_at DESC LIMIT 1",UUID.class,member);
            assertThat(session).as("Do not apply an older session over a newer completed play").isEqualTo(latest);
            var result=context.getBean(AiUserProfileService.class).updateFromSession(member,session,analysis);
            Files.writeString(folder.resolve(arm+"-profile-"+analysisId+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(result),StandardOpenOption.CREATE_NEW);
            assertThat(result.status()).isEqualTo("READY");
            assertThat(result.sourceAnalysisId()).isEqualTo(analysisId);
            assertThat(result.sourceDatasetId()).isEqualTo(input.id());
        }
    }
}
