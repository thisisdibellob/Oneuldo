package oneuldo.ai.client;

import java.time.Duration;
import java.util.ArrayList;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.ai.exception.AiTransportException;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OllamaConnectionRecoveryTest {
    private static final String OK="{\"done\":true,\"done_reason\":\"stop\",\"message\":{\"content\":\"ok\"}}";
    private OllamaProperties settings() {
        return new OllamaProperties("https://ai.example.com","qwen3.6:27b-q4_K_M",8192,
                Duration.ofMinutes(30),Duration.ZERO,0,"10m","secret-test-key",Duration.ofSeconds(15),2,Duration.ZERO);
    }
    @Test void retriesOnlyConnectionEstablishmentAndKeepsRequestIdentity() {
        var builder=RestClient.builder().baseUrl("https://ai.example.com");
        var server=MockRestServiceServer.bindTo(builder).build();var ids=new ArrayList<String>();
        for(int i=0;i<2;i++) server.expect(requestTo("https://ai.example.com/api/chat"))
                .andExpect(r->ids.add(r.getHeaders().getFirst("X-Request-ID")))
                .andRespond(withException(new java.net.http.HttpConnectTimeoutException("connect")));
        server.expect(requestTo("https://ai.example.com/api/chat"))
                .andExpect(r->ids.add(r.getHeaders().getFirst("X-Request-ID")))
                .andRespond(withSuccess(OK,MediaType.APPLICATION_JSON));
        assertThat(new RestOllamaChatClient(builder.build(),settings()).complete("s","u").text()).isEqualTo("ok");
        assertThat(ids).hasSize(3);assertThat(ids.stream().distinct().count()).isEqualTo(1);
        assertThatCode(()->java.util.UUID.fromString(ids.getFirst())).doesNotThrowAnyException();server.verify();
    }
    @Test void boundsRetriesPreservesDiagnosticsAndReleasesQueue() {
        var builder=RestClient.builder().baseUrl("https://ai.example.com");var server=MockRestServiceServer.bindTo(builder).build();
        for(int i=0;i<3;i++) server.expect(requestTo("https://ai.example.com/api/chat")).andRespond(withException(new java.net.ConnectException("refused")));
        server.expect(requestTo("https://ai.example.com/api/chat")).andRespond(withSuccess(OK,MediaType.APPLICATION_JSON));
        var client=new RestOllamaChatClient(builder.build(),settings());
        var failure=catchThrowableOfType(AiTransportException.class,()->client.complete("s","u"));
        assertThat(failure.code()).isEqualTo(AiTransportException.Code.AI_CONNECT_FAILED);
        assertThat(failure.details().attempts()).isEqualTo(3);
        assertThat(failure.details().causeType()).isEqualTo("ConnectException");
        assertThat(failure.details().toString()).doesNotContain("secret-test-key");
        assertThat(client.complete("s","u").text()).isEqualTo("ok");server.verify();
    }
    @Test void neverReplaysReadTimeoutResetTlsFailureOrHttpErrors() {
        var unresolved=new java.net.ConnectException("resolve");unresolved.initCause(new java.nio.channels.UnresolvedAddressException());
        var failures=java.util.List.of(new java.net.http.HttpTimeoutException("read"),new java.net.SocketException("reset"),new javax.net.ssl.SSLHandshakeException("certificate"),new java.net.UnknownHostException("unknown"),unresolved);
        var codes=java.util.List.of(AiTransportException.Code.AI_RESPONSE_TIMEOUT,AiTransportException.Code.AI_TRANSPORT_ERROR,AiTransportException.Code.AI_TLS_FAILED,AiTransportException.Code.AI_DNS_FAILED,AiTransportException.Code.AI_DNS_FAILED);
        for(int i=0;i<failures.size();i++) {
            var builder=RestClient.builder().baseUrl("https://ai.example.com");var server=MockRestServiceServer.bindTo(builder).build();
            server.expect(requestTo("https://ai.example.com/api/chat")).andRespond(withException(failures.get(i)));
            var client=new RestOllamaChatClient(builder.build(),settings());
            var failure=catchThrowableOfType(AiTransportException.class,()->client.complete("s","u"));
            assertThat(failure.code()).isEqualTo(codes.get(i));assertThat(failure.details().attempts()).isEqualTo(1);server.verify();
        }
        for(int status:new int[]{401,403,429,500,503}) {
            var builder=RestClient.builder().baseUrl("https://ai.example.com");var server=MockRestServiceServer.bindTo(builder).build();
            server.expect(requestTo("https://ai.example.com/api/chat")).andRespond(withStatus(org.springframework.http.HttpStatus.valueOf(status)).body("private-provider-body"));
            var client=new RestOllamaChatClient(builder.build(),settings());
            var failure=catchThrowableOfType(AiTransportException.class,()->client.complete("s","u"));
            assertThat(failure.details().httpStatus()).isEqualTo(status);assertThat(failure.details().attempts()).isEqualTo(1);
            assertThat(failure.code()).isEqualTo(status<429?AiTransportException.Code.AI_AUTH_FAILED:status==429?AiTransportException.Code.AI_RATE_LIMITED:AiTransportException.Code.AI_SERVER_ERROR);
            assertThat(failure.getMessage()).doesNotContain("private-provider-body");server.verify();
        }
    }
}
