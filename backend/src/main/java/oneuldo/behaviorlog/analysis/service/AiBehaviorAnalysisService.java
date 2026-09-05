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
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class AiBehaviorAnalysisService {
    private final BehaviorAnalysisInputService inputs;
    private final AiBehaviorAnalysisRepository repository;
    private final AiBehaviorAnalysisPromptFactory prompts;
    private final AiBehaviorAnalysisValidator validator;
    private final GroqChatClient client;
    private final ObjectMapper mapper;
    @Value("${ai.behavior-analysis.max-input-chars:60000}")
    private int maxInputChars = 60000;

    public AiBehaviorAnalysisResponse analyze(UUID memberId, BehaviorAnalysisInputRequest request) {
        return analyzeInput(memberId, inputs.create(memberId, request));
    }

    public AiBehaviorAnalysisResponse analyzeSession(UUID memberId, UUID sessionId) {
        return analyzeInput(memberId, inputs.createForSession(memberId, null, sessionId));
    }

    private AiBehaviorAnalysisResponse analyzeInput(UUID memberId, BehaviorAnalysisInputResponse input) {
        long start = System.nanoTime();
        String system = prompts.systemPrompt();
        String prompt = prompts.userPrompt(input);
        String status = "FAILED", error = null, model = null;
        AiBehaviorAnalysis analysis = null;
        List<AiBehaviorAnalysisRun.Attempt> attempts = new ArrayList<>();
        if (input.eventCount() == 0) {
            status = "NO_HISTORY";
        } else if (system.length() + prompt.length() > maxInputChars) {
            var pipeline = new TimelineAnalysisPipeline(prompts, validator, client, mapper);
            try {
                analysis = pipeline.analyze(input, maxInputChars, attempts);
                model = pipeline.model(); status = "READY";
            } catch (IllegalArgumentException tooLarge) {
                status = "INPUT_TOO_LARGE"; error = tooLarge.getMessage();
            } catch (RuntimeException failure) {
                status = "FAILED"; error = "CHUNK_ANALYSIS_FAILED";
            }
        } else {
            for (int number = 1; number <= 2; number++) {
                GroqChatClient.GroqChatResult output;
                String submittedPrompt = prompt + (number == 2
                        ? "\n이전 응답은 구조 또는 근거 참조 검사를 통과하지 못했습니다. 실제 ID와 출력 계약을 다시 확인하세요." : "");
                try {
                    output = client.complete(system, submittedPrompt, 4500, 0.2);
                    model = output.model();
                } catch (RuntimeException failure) {
                    error = "AI_UNAVAILABLE";
                    attempts.add(new AiBehaviorAnalysisRun.Attempt(number, submittedPrompt, null, error));
                    break;
                }
                try {
                    analysis = validator.validate(mapper.readerFor(AiBehaviorAnalysis.class)
                            .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                            .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                            .readValue(output.text()), input);
                    attempts.add(new AiBehaviorAnalysisRun.Attempt(number, submittedPrompt, output.text(), null));
                    status = "READY"; error = null; break;
                } catch (RuntimeException invalid) {
                    error = "INVALID_AI_ANALYSIS";
                    analysis = null;
                    attempts.add(new AiBehaviorAnalysisRun.Attempt(number, submittedPrompt, output.text(), error));
                }
            }
        }
        var saved = repository.save(new AiBehaviorAnalysisRun(memberId, input.id(), status,
                AiBehaviorAnalysisPromptFactory.VERSION, AiBehaviorAnalysisPromptFactory.EVIDENCE_VERSION,
                model, system, prompt, attempts, analysis, error,
                (System.nanoTime() - start) / 1_000_000L, input.eventCount()));
        return AiBehaviorAnalysisResponse.from(saved);
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
