package oneuldo.behaviorlog.analysis.service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.repository.AiBehaviorAnalysisRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class AiBehaviorAnalysisService {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(AiBehaviorAnalysisService.class);
    private final BehaviorAnalysisInputService inputs;
    private final AiBehaviorAnalysisRepository repository;
    private final AiBehaviorAnalysisPromptFactory prompts;
    private final AiBehaviorAnalysisValidator validator;
    private final GroqChatClient client;
    private final ObjectMapper mapper;
    private final AnalysisTokenBudget budget;
    private final AnalysisCallPacer pacer;
    private final oneuldo.behaviorlog.profile.service.AiUserProfileService userProfiles;
    @Value("${ai.behavior-analysis.max-chunks:64}")
    private int maxChunks = 64;
    @Value("${ai.cache-identity:${ai.groq.model:qwen/qwen3.6-27b}}") private String configuredModel="qwen/qwen3.6-27b";
    private final oneuldo.ai.service.SingleFlight<String,AiBehaviorAnalysisResponse> requests=new oneuldo.ai.service.SingleFlight<>();
    private final oneuldo.ai.service.SingleFlight<String,AiBehaviorAnalysisResponse> datasets=new oneuldo.ai.service.SingleFlight<>();
    private AnalysisCheckpointStore checkpointStore;
    @org.springframework.beans.factory.annotation.Autowired
    public void setCheckpointStore(AnalysisCheckpointStore store) {checkpointStore=store;}

    public AiBehaviorAnalysisResponse analyze(UUID memberId, BehaviorAnalysisInputRequest request) {
        String scope=memberId+":window:"+(request==null?"null:null":request.analysisFrom()+":"+request.analysisTo());
        return requests.run(scope,()->analyzeShared(memberId, inputs.create(memberId, request)));
    }

    public AiBehaviorAnalysisResponse analyzeSession(UUID memberId, UUID sessionId) {
        return requests.run(memberId+":session:"+sessionId,()->{
            var result=analyzeShared(memberId, inputs.createForSession(memberId, null, sessionId));
            if ("READY".equals(result.status())) {
                try { userProfiles.updateFromSession(memberId, sessionId, result); }
                catch (RuntimeException failure) {
                    log.warn("Session analysis succeeded but user profile update failed: member={}, session={}",
                            memberId, sessionId, failure);
                }
            }
            return result;
        });
    }

    public AiBehaviorAnalysisResponse analyzeSnapshot(UUID memberId, UUID datasetId) {
        return analyzeShared(memberId, inputs.find(memberId, datasetId));
    }
    public AiBehaviorAnalysisResponse resume(UUID memberId, UUID analysisId) {
        return analyzeSnapshot(memberId,find(memberId,analysisId).datasetId());
    }

    @org.springframework.beans.factory.annotation.Value("${ai.behavior-analysis.quality-review:false}")
    private boolean qualityReview;
    @org.springframework.beans.factory.annotation.Value("${ai.behavior-analysis.plan-source-review:true}")
    private boolean planSourceReview;

    private AiBehaviorAnalysisResponse analyzeShared(UUID memberId, BehaviorAnalysisInputResponse input) {
        return datasets.run(memberId+":"+input.id(),()->analyzeInput(memberId,input));
    }
    private AiBehaviorAnalysisResponse analyzeInput(UUID memberId, BehaviorAnalysisInputResponse input) {
        long start = System.nanoTime();
        String system = prompts.systemPrompt();
        var references = new AnalysisReferences(mapper, input);
        String prompt = references.encode(prompts.userPrompt(input));
        String requestKey=oneuldo.ai.service.AiRequestFingerprint.of(mapper,memberId,input.id(),configuredModel,
                system,mapper.readTree(prompt),prompts.observationSystem(),prompts.digestContract(),prompts.reductionContract(),
                FinalAnalysisPromptCompactor.systemPrompt(),FinalAnalysisPromptCompactor.VERSION,FinalSourceEncoding.VERSION,FinalSourceEncoding.ENCODER_REVISION,AnalysisSynthesisPrompt.VERSION,
                budget.requestTokens(),budget.chunkOutputTokens(),budget.finalOutputTokens(),maxChunks,0.2,
                MovementProjection.VERSION,prompts.movementMaxError(),MovementInputEncoder.VERSION,"analysis-reuse-v5-plan-source-reviewed", qualityReview, AnalysisReviewPrompt.VERSION, AnalysisReviewPrompt.system(),
                planSourceReview, AnalysisPlanSemanticReview.VERSION, AnalysisPlanSemanticReview.system());
        var reusable=repository.findFirstByMemberIdAndDatasetIdAndRequestKeyAndStatusOrderByCreatedAtDesc(memberId,input.id(),requestKey,"READY");
        if(reusable.isPresent()) {
            try {
                validator.validate(reusable.get().getResult(),input);
                return AiBehaviorAnalysisResponse.from(reusable.get());
            } catch(IllegalArgumentException invalid) { /* Current validation wins; recompute rather than serve stale data. */ }
        }
        String status = "FAILED", error = null, model = null;
        AiBehaviorAnalysis analysis = null;
        List<AiBehaviorAnalysisRun.Attempt> attempts = new ArrayList<>();
        if (input.eventCount() == 0) {
            status = "NO_HISTORY";
        } else {
            var pipeline = new TimelineAnalysisPipeline(prompts, validator, client, mapper, maxChunks, budget, pacer)
                    .withQualityReview(qualityReview).withPlanSemanticReview(qualityReview && planSourceReview);
            if(checkpointStore!=null) pipeline.withCheckpoints(checkpointStore.scope(memberId,input.id()));
            try {
                analysis = pipeline.analyze(input, budget.requestTokens(), attempts, references, prompt);
                model = pipeline.model(); status = "READY";
            } catch (RuntimeException failure) {
                status = failureStatus(failure);
                error = failureCode(failure);
            }
            model = pipeline.model();
        }
        var saved = repository.save(new AiBehaviorAnalysisRun(memberId, input.id(), status,
                AiBehaviorAnalysisPromptFactory.VERSION, AiBehaviorAnalysisPromptFactory.EVIDENCE_VERSION,
                model, system, prompt, attempts, analysis, error,
                (System.nanoTime() - start) / 1_000_000L, input.eventCount(),requestKey));
        return AiBehaviorAnalysisResponse.from(saved);
    }

    static String failureStatus(RuntimeException failure) {
        return failure instanceof oneuldo.ai.exception.AiInputLimitException ? "INPUT_TOO_LARGE" : "FAILED";
    }
    static String failureCode(RuntimeException failure) {
        if (failure instanceof oneuldo.ai.exception.AiInputLimitException) return failure.getMessage();
        String code=failure.getMessage();
        return code!=null && (List.of("AI_RATE_LIMITED", "AI_UNAVAILABLE", "INVALID_AI_ANALYSIS",
                "INVALID_REVIEW_STATION_PATCH", "INVALID_REVIEW_CLAIM_TEXT_PATCH", "INVALID_REVIEW_METADATA_PATCH",
                "INVALID_REVIEW_SEMANTIC_TEXT_PATCH",
                "INVALID_REVIEW_ALTERNATIVE_PATCH",
                "INVALID_REVIEW_TECHNICAL_PATCH", "CHUNK_CALL_BUDGET_EXCEEDED", "TOTAL_CALL_BUDGET_EXCEEDED",
                "TOKENIZER_MODEL_MISMATCH", "INVALID_TOKEN_BUDGET").contains(code)
                || oneuldo.ai.exception.AiTransportException.isCode(code)) ? code : "CHUNK_ANALYSIS_FAILED";
    }

    public AiBehaviorAnalysisResponse latest(UUID memberId) {
        return repository.findFirstByMemberIdOrderByCreatedAtDesc(memberId)
                .map(AiBehaviorAnalysisResponse::from).orElse(null);
    }

    public AiBehaviorAnalysisResponse find(UUID memberId, UUID id) {
        return repository.findByIdAndMemberId(id, memberId).map(AiBehaviorAnalysisResponse::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "분석을 찾을 수 없습니다."));
    }
}
