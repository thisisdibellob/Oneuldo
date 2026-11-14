package oneuldo.gateway;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("gateway")
public record GatewaySettings(URI upstream, Duration timeout, Duration queueTimeout,
        int maxQueued, Map<String, String> apiKeyHashes, Integer parallelism, Integer maxPerKey, String tokenizerPython,
        Integer prefillBatchSize) {
    public GatewaySettings(URI upstream,Duration timeout,Duration queueTimeout,int maxQueued,Map<String,String> hashes,Integer parallelism,Integer maxPerKey,String tokenizerPython) {
        this(upstream,timeout,queueTimeout,maxQueued,hashes,parallelism,maxPerKey,tokenizerPython,null);
    }
    public GatewaySettings(URI upstream,Duration timeout,Duration queueTimeout,int maxQueued,Map<String,String> apiKeyHashes) {
        this(upstream,timeout,queueTimeout,maxQueued,apiKeyHashes,null,null,null);
    }
    public GatewaySettings(URI upstream,Duration timeout,Duration queueTimeout,int maxQueued,Map<String,String> hashes,Integer parallelism,Integer maxPerKey) {
        this(upstream,timeout,queueTimeout,maxQueued,hashes,parallelism,maxPerKey,null);
    }
    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public GatewaySettings {
        prefillBatchSize=prefillBatchSize==null?512:prefillBatchSize;
        if(!java.util.List.of(512,1024,2048).contains(prefillBatchSize))throw new IllegalArgumentException("Invalid host prefill batch size");
        tokenizerPython=tokenizerPython==null||tokenizerPython.isBlank()?null:tokenizerPython;
        if(tokenizerPython!=null&&!java.nio.file.Path.of(tokenizerPython).isAbsolute())throw new IllegalArgumentException("Tokenizer Python must be a host-configured absolute path");
        parallelism=parallelism==null?1:parallelism;maxPerKey=maxPerKey==null?1:maxPerKey;
        if(parallelism<1||parallelism>2||maxPerKey<1||maxPerKey>parallelism)throw new IllegalArgumentException("Invalid gateway parallelism");
        if (upstream == null || !"http".equals(upstream.getScheme())
                || !"127.0.0.1".equals(upstream.getHost()) || upstream.getPort() < 1) {
            throw new IllegalArgumentException("Gateway upstream must be local Ollama");
        }
        if (timeout == null || timeout.isNegative() || timeout.isZero()
                || queueTimeout == null || queueTimeout.isNegative() || maxQueued < 0 || maxQueued > 32) {
            throw new IllegalArgumentException("Invalid gateway limits");
        }
        if (apiKeyHashes == null || apiKeyHashes.isEmpty()
                || apiKeyHashes.entrySet().stream().anyMatch(e -> !e.getKey().matches("[a-z0-9-]{1,40}")
                || e.getValue() == null || !e.getValue().matches("[a-fA-F0-9]{64}"))) {
            throw new IllegalArgumentException("Configure at least one team API key SHA-256 hash");
        }
        apiKeyHashes = Map.copyOf(apiKeyHashes);
    }
}
