package oneuldo.behaviorlog.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import oneuldo.auth.token.JwtTokenProvider;
import oneuldo.behaviorlog.domain.BehaviorLogBatchRequest;
import oneuldo.behaviorlog.domain.BehaviorLogBatchResponse;
import oneuldo.behaviorlog.domain.BehaviorLogIngestStatus;
import oneuldo.behaviorlog.domain.BehaviorLogResponse;
import oneuldo.behaviorlog.domain.payload.ShoppingBehaviorPayload;
import oneuldo.behaviorlog.repository.BehaviorLogRepository;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberRole;
import oneuldo.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.ObjectMapper;

/**
 * Opt-in contract check against the real HTTP server, using a simulator-generated batch.
 * Set MARKET_SIMULATOR_HTTP_FIXTURE to its absolute JSON path. No existing app or DB is used.
 */
@EnabledIfEnvironmentVariable(named = "MARKET_SIMULATOR_HTTP_FIXTURE", matches = ".+")
@ActiveProfiles("synthetic-http-test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1",
        "spring.config.import=",
        "spring.datasource.url=jdbc:h2:mem:synthetic-market-http;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false",
        "ai.groq.enabled=false",
        "ai.analysis-jobs.enabled=false",
        "security.jwt.secret=MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
        "security.jwt.issuer=synthetic-http-test",
        "security.jwt.access-expiration=PT30M",
        "security.jwt.refresh-expiration=P14D"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class SyntheticMarketBatchHttpTest {

    @LocalServerPort private int port;
    @Autowired private ObjectMapper mapper;
    @Autowired private JwtTokenProvider tokens;
    @Autowired private MemberRepository members;
    @Autowired private BehaviorLogRepository logs;
    @Autowired private DataSource dataSource;

    @Test
    void generated_batch_is_accepted_over_http_and_preserves_synthetic_provenance() throws Exception {
        try (var connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getURL()).startsWith("jdbc:h2:mem:synthetic-market-http");
        }
        Path fixture = Path.of(System.getenv("MARKET_SIMULATOR_HTTP_FIXTURE")).toAbsolutePath();
        assertThat(fixture).isRegularFile();
        String body = Files.readString(fixture);
        BehaviorLogBatchRequest batch = mapper.readValue(body, BehaviorLogBatchRequest.class);
        assertThat(batch.batchId()).isNotNull();
        assertThat(batch.events()).hasSizeBetween(1, 50);
        for (var event : batch.events()) {
            assertThat(event.payload()).isInstanceOf(ShoppingBehaviorPayload.class);
            var provenance = mapper.valueToTree(event.payload()).path("marketContent").path("provenance");
            assertThat(provenance.path("source").asString()).isEqualTo("synthetic");
            assertThat(provenance.path("agentModel").asString()).isNotBlank();
            assertThat(provenance.path("personaId").asString()).isNotBlank();
            assertThat(provenance.path("personaVersion").asString()).isNotBlank();
        }

        String suffix = UUID.randomUUID().toString();
        Member member = members.saveAndFlush(new Member(
                "synthetic-http-" + suffix, "unused-test-password", "Synthetic HTTP fixture",
                suffix + "@synthetic.invalid", MemberRole.CHILD, LocalDate.of(2000, 1, 1)));
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create("http://127.0.0.1:" + port + "/api/behavior-logs/batches"))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + tokens.createAccessToken(member))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        try (HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()) {
            var acceptedHttp = client.send(request, HttpResponse.BodyHandlers.ofString());
            assertThat(acceptedHttp.statusCode()).as(acceptedHttp.body()).isEqualTo(200);
            var accepted = mapper.readValue(acceptedHttp.body(), BehaviorLogBatchResponse.class);
            assertThat(accepted.batchId()).isEqualTo(batch.batchId());
            assertThat(accepted.events()).hasSize(batch.events().size())
                    .extracting(BehaviorLogResponse::status).containsOnly(BehaviorLogIngestStatus.ACCEPTED);
            assertThat(accepted.events()).extracting(BehaviorLogResponse::clientEventId)
                    .containsExactlyElementsOf(batch.events().stream().map(e -> e.metadata().clientEventId()).toList());

            for (var event : batch.events()) {
                var saved = logs.findByMemberIdAndClientEventId(member.getId(), event.metadata().clientEventId())
                        .orElseThrow();
                assertThat(saved.getSessionId()).isEqualTo(event.identity().sessionId());
                assertThat(saved.getEventSequence()).isEqualTo(event.metadata().eventSequence());
                assertThat(mapper.valueToTree(saved.getPayload()).path("marketContent").path("provenance"))
                        .isEqualTo(mapper.valueToTree(event.payload()).path("marketContent").path("provenance"));
            }

            var retryHttp = client.send(request, HttpResponse.BodyHandlers.ofString());
            assertThat(retryHttp.statusCode()).as(retryHttp.body()).isEqualTo(200);
            var retry = mapper.readValue(retryHttp.body(), BehaviorLogBatchResponse.class);
            assertThat(retry.events()).hasSize(batch.events().size())
                    .extracting(BehaviorLogResponse::status).containsOnly(BehaviorLogIngestStatus.DUPLICATE);
            assertThat(logs.count()).isEqualTo(batch.events().size());

            Path report = Path.of("build/reports/market-simulator-http-smoke.json");
            Files.createDirectories(report.getParent());
            Files.writeString(report, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
                    "fixture", fixture.toString(), "database", "isolated H2 in-memory database",
                    "httpStatus", acceptedHttp.statusCode(), "response", accepted,
                    "retryHttpStatus", retryHttp.statusCode(), "retryResponse", retry,
                    "persistedEventCount", logs.count(), "provenancePreserved", true)));
        }
    }
}
