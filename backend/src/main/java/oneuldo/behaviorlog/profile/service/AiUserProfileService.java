package oneuldo.behaviorlog.profile.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysis;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisRun;
import oneuldo.behaviorlog.profile.domain.*;
import oneuldo.behaviorlog.profile.repository.AiUserProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class AiUserProfileService {
    private static final Logger log = LoggerFactory.getLogger(AiUserProfileService.class);
    private final AiUserProfileRepository repository;
    private final AiUserProfilePromptFactory prompts;
    private final AiUserProfileValidator validator;
    private final GroqChatClient client;
    private final ObjectMapper mapper;
    private final oneuldo.behaviorlog.analysis.service.AnalysisTokenBudget tokenBudget;
    private final oneuldo.behaviorlog.personalization.service.PracticeHistoryService history;
    private final oneuldo.ai.service.SingleFlight<String, AiUserProfileResponse> requests = new oneuldo.ai.service.SingleFlight<>();

    public AiUserProfileResponse updateFromSession(UUID memberId, UUID sessionId,
            AiBehaviorAnalysisResponse sessionAnalysis) {
        if (!"READY".equals(sessionAnalysis.status()) || sessionAnalysis.analysis() == null)
            throw new IllegalArgumentException("READY_SESSION_ANALYSIS_REQUIRED");
        return requests.run(memberId + ":" + sessionAnalysis.analysisId(),
                () -> updateOnce(memberId, sessionId, sessionAnalysis));
    }

    private AiUserProfileResponse updateOnce(UUID memberId, UUID sessionId,
            AiBehaviorAnalysisResponse current) {
        var reused = repository.findFirstByMemberIdAndSourceAnalysisIdAndStatusOrderByCreatedAtDesc(
                memberId, current.analysisId(), "READY");
        if (reused.isPresent()) return AiUserProfileResponse.from(reused.get());
        var previous = repository.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(memberId, "READY").orElse(null);
        if (previous == null) return saveInitial(memberId, sessionId, current);

        long started = System.nanoTime();
        String system = prompts.systemPrompt();
        var references = new AiUserProfileReferences(mapper, previous, current);
        String prompt = references.encode(prompts.withPracticeHistory(prompts.userPrompt(previous, current), history.forUpdate(memberId, previous, current)));
        List<AiBehaviorAnalysisRun.Attempt> attempts = new ArrayList<>();
        AiBehaviorAnalysis profile = null;
        String model = null, error = null;
        int outputMax = tokenBudget.finalOutputTokens();
        String retryFeedback = "";
        for (int number = 1; number <= 2; number++) {
            String submitted = prompt + retryFeedback;
            GroqChatClient.GroqChatResult response = null;
            long attemptStarted = System.nanoTime();
            try {
                tokenBudget.requireFits(system, submitted, outputMax, tokenBudget.requestTokens(),
                        "USER_PROFILE_INPUT_EXCEEDS_LIMIT");
                response = client.complete(system, submitted, outputMax, 0.2);
                model = response.model();
                if ("length".equals(response.finishReason())) throw new IllegalArgumentException("OUTPUT_TRUNCATED");
                var draft = references.read(response.text());
                validator.validate(draft, previous, current);
                profile = new AiBehaviorAnalysis(draft.summary(), draft.findings(),
                        current.analysis().sessionAssessments(), draft.uncertainties(),
                        draft.practicePlan(), draft.usedEvidenceCardIds());
                attempts.add(attempt(number, submitted, outputMax, response, null));
                break;
            } catch (RuntimeException failure) {
                var transport = failure instanceof oneuldo.ai.exception.AiTransportException t ? t : null;
                error = transport != null ? transport.code().name() : response == null ? "AI_UNAVAILABLE" : "INVALID_USER_PROFILE";
                var audit = attempt(number, submitted, outputMax, response, error);
                var validation = failure instanceof oneuldo.behaviorlog.analysis.service.ReviewEvidenceException v ? v.details() : null;
                retryFeedback = "\n이전 응답이 검사를 통과하지 못했습니다. 오류: "
                        + (validation == null ? ("length".equals(response == null ? null : response.finishReason()) ? "OUTPUT_TRUNCATED" : "INVALID_PROFILE_CONTRACT")
                            : mapper.writeValueAsString(validation))
                        + ". 입력의 allowedEvidenceEventIds와 각 원본 evidenceEventIds 배열을 다시 확인하세요. "
                        + "PROFILE_EVIDENCE_COUNT_EXCEEDS_LIMIT는 한 finding의 근거가 최대 30개를 초과한 오류입니다. "
                        + "허용된 ID 전체를 나열하지 말고 그 관찰을 실제로 지지하는 근거만 선택하세요. "
                        + "서로 다른 행동의 모든 근거가 필요하면 관찰을 구분하고 각 문장에 해당하는 근거를 인용하세요. "
                        + "옛 본문 번호를 복사하거나 무관한 ID로 치환하지 말고, 해당 근거가 지지하는 문장만 다시 작성하세요. JSON 객체 하나를 완성하세요.";
                attempts.add(new AiBehaviorAnalysisRun.Attempt(audit.number(),audit.inputPrompt(),audit.rawOutput(),audit.errorCode(),
                        audit.source(),audit.systemPrompt(),audit.outputMax(),audit.finishReason(),audit.inputTokens(),audit.outputTokens(),
                        elapsed(attemptStarted),transport == null ? null : transport.details(),validation));
                if (response == null) break;
            }
        }
        String status = profile == null ? "FAILED" : "READY";
        var saved = repository.save(new AiUserProfile(memberId, previous.getProfileVersion() + 1,
                previous.getId(), current.analysisId(), current.datasetId(), sessionId, status,
                AiUserProfilePromptFactory.VERSION, model, system, prompt, attempts, profile,
                profile == null ? error : null, elapsed(started)));
        if (!"READY".equals(status)) log.warn("Incremental user profile update failed: member={}, analysis={}", memberId, current.analysisId());
        return AiUserProfileResponse.from(saved);
    }

    private AiUserProfileResponse saveInitial(UUID memberId, UUID sessionId, AiBehaviorAnalysisResponse current) {
        var saved = repository.save(new AiUserProfile(memberId, 1, null, current.analysisId(),
                current.datasetId(), sessionId, "READY", AiUserProfilePromptFactory.VERSION,
                current.model(), "INITIAL_FROM_SESSION_ANALYSIS", "INITIAL_FROM_SESSION_ANALYSIS",
                List.of(), current.analysis(), null, 0));
        return AiUserProfileResponse.from(saved);
    }

    private AiBehaviorAnalysisRun.Attempt attempt(int number, String prompt, int outputMax,
            GroqChatClient.GroqChatResult response, String error) {
        return new AiBehaviorAnalysisRun.Attempt(number, prompt, response == null ? null : response.text(), error,
                "LIVE", prompts.systemPrompt(), outputMax, response == null ? null : response.finishReason(),
                response == null ? null : response.inputTokens(), response == null ? null : response.outputTokens(),
                response == null ? null : response.latencyMs());
    }

    private long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000L; }

    @Transactional(readOnly = true)
    public Optional<AiUserProfileResponse> current(UUID memberId) {
        return repository.findFirstByMemberIdAndStatusOrderByCreatedAtDesc(memberId, "READY")
                .map(AiUserProfileResponse::from);
    }

    @Transactional(readOnly = true)
    public AiUserProfileResponse requireCurrent(UUID memberId) {
        return current(memberId).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                "개인화 프로필이 아직 없습니다. 기본 관찰 퀘스트를 먼저 수행해 주세요."));
    }

    @Transactional(readOnly = true)
    public AiUserProfileResponse find(UUID memberId, UUID profileId) {
        return repository.findByIdAndMemberIdAndStatus(profileId, memberId, "READY")
                .map(AiUserProfileResponse::from)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "개인화 프로필을 찾을 수 없습니다."));
    }
}
