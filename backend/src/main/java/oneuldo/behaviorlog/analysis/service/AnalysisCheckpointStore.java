package oneuldo.behaviorlog.analysis.service;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;
import oneuldo.behaviorlog.analysis.domain.AiAnalysisCheckpoint;
import oneuldo.behaviorlog.analysis.repository.AiAnalysisCheckpointRepository;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.ObjectMapper;

@Service
public class AnalysisCheckpointStore {
    private final AiAnalysisCheckpointRepository repository;
    private final ObjectMapper mapper;
    @Value("${ai.groq.model:qwen/qwen3.6-27b}") private String model="qwen/qwen3.6-27b";
    public AnalysisCheckpointStore(AiAnalysisCheckpointRepository repository,ObjectMapper mapper) {this.repository=repository;this.mapper=mapper;}
    public AnalysisCheckpoints scope(UUID member,UUID dataset) {
        return new AnalysisCheckpoints() {
            public Optional<GroqChatResult> find(String system,String prompt,int output) {
                return repository.findById(key(member,dataset,system,prompt,output)).filter(c->c.getMemberId().equals(member)&&c.getDatasetId().equals(dataset)).map(AiAnalysisCheckpoint::getResponse);
            }
            public void save(String system,String prompt,int output,GroqChatResult response) {
                String key=key(member,dataset,system,prompt,output);
                if(!repository.existsById(key)) repository.saveAndFlush(new AiAnalysisCheckpoint(key,member,dataset,system,prompt,output,response));
            }
        };
    }
    private String key(UUID member,UUID dataset,String system,String prompt,int output) {
        try {
            // Exact prompt/system/model/options match. No cross-user reuse or implicit prompt-version migration.
            int end=prompt.lastIndexOf('}');
            Object canonical=end>=0?List.of(sorted(mapper.readTree(prompt.substring(0,end+1))),prompt.substring(end+1)):prompt;
            String wire=mapper.writeValueAsString(List.of(member,dataset,model,system,canonical,output,0.2,"checkpoint-v1"));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(wire.getBytes(StandardCharsets.UTF_8)));
        } catch(java.security.NoSuchAlgorithmException impossible) {throw new IllegalStateException(impossible);}
    }
    private Object sorted(tools.jackson.databind.JsonNode node) {
        if(node.isObject()) {
            var result=new TreeMap<String,Object>();
            for(String key:node.propertyNames()) result.put(key,sorted(node.get(key)));
            return result;
        }
        if(node.isArray()) {var result=new ArrayList<Object>();node.forEach(n->result.add(sorted(n)));return result;}
        return node;
    }
}
