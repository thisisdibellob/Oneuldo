package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import oneuldo.ai.client.*;
import oneuldo.ai.config.OllamaProperties;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Read-only production review regression against a saved, faulty draft and paired event orders. */
@EnabledIfEnvironmentVariable(named="AI_CLAIM_EVIDENCE_LIVE", matches="true")
class ClaimEvidenceSchoolLiveTest {
    private final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    private final Path root=Path.of(System.getenv().getOrDefault("AI_CLAIM_OUTPUT", "../output/ai-claim-evidence-2026-09-17/v10"));
    private final AiBehaviorAnalysisValidator validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());

    @Test void review_faulty_draft_repeatedly_and_distinguish_event_order() throws Exception {
        Files.createDirectories(root);
        Properties local=new Properties();
        try(var r=Files.newBufferedReader(Path.of("local.properties"))) {local.load(r);}
        var properties=new OllamaProperties("https://oneuldo.duckdns.org","qwen3.6:27b-q4_K_M",18432,
                Duration.ofMinutes(30),Duration.ofMinutes(10),8,"10m",local.getProperty("ai.ollama.api-key"));
        var http=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(properties.connectTimeout()).build());
        http.setReadTimeout(properties.timeout());
        var client=new RestOllamaChatClient(RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(http).build(),properties);
        var input=mapper.readValue(Files.readString(Path.of("../tmp/persona-loop-20260914/round1-input.json")),BehaviorAnalysisInputResponse.class);
        String before=mapper.writeValueAsString(input);
        var old=mapper.readValue(Files.readString(Path.of("../tmp/ai-reliability-verified-20260917/other-208/analysis.json")),AiBehaviorAnalysisResponse.class);
        var runs=mapper.readTree(Files.readString(Path.of("../tmp/ai-reliability-verified-20260917/other-208/attempts.json")));
        var attempts=runs.get(runs.size()-1).path("attempts");
        var source=(ObjectNode)mapper.readTree(attempts.get(attempts.size()-1).path("inputPrompt").asString());
        var refs=new AnalysisReferences(mapper,input);
        // Retain the old erroneous digest/draft as a challenge, replace only the raw facts/rules.
        var wrapped=mapper.createObjectNode();wrapped.set(SourceEventDetails.FIELD,SourceEventDetails.build(mapper,input));
        source.set(SourceEventDetails.FIELD,mapper.readTree(refs.encode(wrapped.toString())).path(SourceEventDetails.FIELD));
        source.put("sourceEventDetailsRule",SourceEventDetails.RULE);
        source.put("outputContract",AnalysisSynthesisPrompt.CONTRACT);
        String mode=System.getenv().getOrDefault("AI_CLAIM_MODE","review");
        assertThat(mode).isIn("review","paired","all");
        boolean allPassed=true;
        for(int run=1;run<=3;run++) {
            if(mode.equals("review") || mode.equals("all")) {
                allPassed &= review(client,"original-208-review-"+run,input,old.analysis(),source.toString());
            }
            if(mode.equals("paired") || mode.equals("all")) {
                for(boolean swapped:List.of(false,true)) {
                    var paired=paired(input,swapped);
                    var events=paired.input().sessions().getFirst().events();
                    var ids=events.stream().map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList();
                    var draft=new AiBehaviorAnalysis("사과 수량 변경 후 장바구니 확인",List.of(new AiBehaviorAnalysis.Finding(
                            "F1","수량 조작","사과를 1개 담고 2개로 바꾼 뒤 장바구니를 열었다.",
                            "사용자가 목표를 이해하고 의도적으로 점검했다.",List.of("우연히 버튼을 눌렀을 수도 있다."),ids,"목록과 수량을 비교하는 연습을 제안한다.")),
                            List.of(new AiBehaviorAnalysis.SessionAssessment(paired.input().sessions().getFirst().sessionId(),"UNDETERMINED","일부 기록만 제공됨",ids)),
                            List.of("일부 기록이며 동기와 이해도는 미확인"),old.analysis().practicePlan());
                    var draftTree=(ObjectNode)mapper.valueToTree(draft);
                    ((ObjectNode)draftTree.path("practicePlan")).putArray("targetFindingIds").add("F1");
                    draft=mapper.convertValue(draftTree,AiBehaviorAnalysis.class);
                    var prompts=new AiBehaviorAnalysisPromptFactory(mapper);
                    String prompt=new AnalysisReferences(mapper,paired).encode(prompts.userPrompt(paired));
                    allPassed &= review(client,(swapped?"pair-change-before-open-":"pair-open-before-change-")+run,paired,draft,prompt);
                }
            }
        }
        assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
        assertThat(allPassed).isTrue();
    }

    private BehaviorAnalysisInputResponse paired(BehaviorAnalysisInputResponse original,boolean swapped) {
        var tree=(ObjectNode)mapper.valueToTree(original);
        var input=(ObjectNode)tree.path("input");
        var session=(ObjectNode)input.path("sessions").get(0);
        var source=session.path("events").deepCopy();
        session.putNull("integrity");session.putNull("endedAt");
        var events=session.putArray("events");
        int[] order=swapped?new int[]{104,107,105}:new int[]{104,105,107};
        for(int i=0;i<order.length;i++) {
            var event=(ObjectNode)source.get(order[i]).deepCopy();
            event.put("sequence",i+1);event.put("elapsedFromSessionStartMs",i*1000);
            event.put("occurredAt",original.input().sessions().getFirst().startedAt().plusSeconds(i).toString());
            // Both variants have the same three event facts; remove snapshots that encode the original ordering.
            var payload=event.path("payload").deepCopy();
            var minimal=event.putObject("payload");
            for(String field:List.of("type","itemId","selectedQuantity","quantityBefore","quantityAfter","requiredQuantity"))
                if(payload.hasNonNull(field)) minimal.set(field,payload.get(field));
            event.putObject("action").put("eventCode",source.get(order[i]).path("action").path("eventCode").asString());
            for(String field:List.of("task","taskResult","support","error","sessionEnd","validity")) event.remove(field);
            events.add(event);
        }
        tree.put("eventCount",3);input.put("eventCount",3);
        return mapper.convertValue(tree,BehaviorAnalysisInputResponse.class);
    }

    private boolean review(RestOllamaChatClient client,String name,BehaviorAnalysisInputResponse input,AiBehaviorAnalysis draft,String source) throws Exception {
        var refs=new AnalysisReferences(mapper,input);
        String prompt=AnalysisReviewPrompt.build(mapper,source,draft,refs);
        var report=mapper.createObjectNode();report.put("name",name);report.put("databaseWrites",false);report.put("cachedInference",false);
        report.put("reviewVersion",AnalysisReviewPrompt.VERSION);report.set("input",mapper.valueToTree(input));
        report.put("systemPrompt",AnalysisReviewPrompt.system());report.put("inputPrompt",prompt);
        var calls=report.putArray("calls");
        long started=System.nanoTime();boolean valid=false;
        for(int retry=0;retry<2&&!valid;retry++) {
            var call=calls.addObject();
            String submitted=prompt+(retry==0?"":"\n이전 구조 검사 오류: "+calls.get(0).path("error").asString()+". 원본을 다시 보고 전체 JSON과 모든 claimChecks를 완성하세요.");
            new AnalysisTokenBudget().requireFits(AnalysisReviewPrompt.system(),submitted,1800,18000,"LIVE_REVIEW_TOO_LARGE");
            Files.writeString(root.resolve(name+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
            GroqChatClient.GroqChatResult response;
            try {response=client.complete(AnalysisReviewPrompt.system(),submitted,1800,0.2);}
            catch (RuntimeException failure) {
                call.put("transportError",failure.getMessage());
                report.put("wallSeconds",(System.nanoTime()-started)/1_000_000_000.0);
                report.put("structurallyValid",false);
                Files.writeString(root.resolve(name+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
                throw failure;
            }
            call.set("response",mapper.valueToTree(response));
            try {
                assertThat(response.finishReason()).isNotEqualTo("length");
                var result=validator.validate(refs.read(AnalysisReviewPrompt.reviewedAnalysis(mapper,response.text(),refs)),input);
                report.set("analysis",mapper.valueToTree(result));valid=true;
            } catch(RuntimeException|AssertionError e) {call.put("error",e.getMessage());}
            report.put("wallSeconds",(System.nanoTime()-started)/1_000_000_000.0);report.put("structurallyValid",valid);
            Files.writeString(root.resolve(name+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(report));
        }
        System.out.println("CLAIM_REVIEW "+name+" valid="+valid+" seconds="+report.path("wallSeconds").asDouble());
        return valid;
    }
}
