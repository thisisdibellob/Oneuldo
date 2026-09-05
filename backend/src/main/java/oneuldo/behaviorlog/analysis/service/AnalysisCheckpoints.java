package oneuldo.behaviorlog.analysis.service;
import java.util.Optional;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;

/** Scoped by owner/dataset by the caller. Only validated completions are saved. */
public interface AnalysisCheckpoints {
    Optional<GroqChatResult> find(String system,String prompt,int output);
    void save(String system,String prompt,int output,GroqChatResult result);
    AnalysisCheckpoints NONE=new AnalysisCheckpoints() {
        public Optional<GroqChatResult> find(String s,String p,int o) {return Optional.empty();}
        public void save(String s,String p,int o,GroqChatResult r) {}
    };
}
