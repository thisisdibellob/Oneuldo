package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import oneuldo.ai.client.GroqChatClient;
import oneuldo.behaviorlog.analysis.domain.*;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.node.ObjectNode;

/** Each leaf receives every original event in its range. Merge is AI interpretation, never a vote/count rule. */
public final class TimelineAnalysisPipeline {
    private final AiBehaviorAnalysisPromptFactory prompts;
    private final AiBehaviorAnalysisValidator validator;
    private final GroqChatClient client;
    private final ObjectMapper mapper;
    private String model;
    public TimelineAnalysisPipeline(AiBehaviorAnalysisPromptFactory prompts, AiBehaviorAnalysisValidator validator,
            GroqChatClient client, ObjectMapper mapper) {
        this.prompts = prompts; this.validator = validator; this.client = client; this.mapper = mapper;
    }
    public String model() { return model; }
    public List<BehaviorAnalysisInputResponse> partition(BehaviorAnalysisInputResponse input, int limit) {
        List<BehaviorAnalysisInputResponse> result = new ArrayList<>();
        split(input, limit, result);
        if (result.size() > 16) throw new IllegalArgumentException("CHUNK_CALL_BUDGET_EXCEEDED");
        return result;
    }
    private void split(BehaviorAnalysisInputResponse input, int limit, List<BehaviorAnalysisInputResponse> output) {
        if (output.size() >= 16) throw new IllegalArgumentException("CHUNK_CALL_BUDGET_EXCEEDED");
        if (prompts.systemPrompt().length() + prompts.userPrompt(input).length() + 300 <= limit) { output.add(input); return; }
        if (input.eventCount() <= 1) throw new IllegalArgumentException("SINGLE_EVENT_EXCEEDS_LIMIT");
        int half = input.eventCount() / 2;
        split(slice(input, 0, half), limit, output);
        split(slice(input, half, input.eventCount()), limit, output);
    }
    private BehaviorAnalysisInputResponse slice(BehaviorAnalysisInputResponse input, int from, int to) {
        int cursor = 0;
        List<BehaviorAnalysisInput.SessionTimeline> sessions = new ArrayList<>();
        for (var session : input.input().sessions()) {
            List<BehaviorAnalysisInput.EventTimeline> events = new ArrayList<>();
            for (var event : session.events()) { if (cursor >= from && cursor < to) events.add(event); cursor++; }
            if (!events.isEmpty()) sessions.add(new BehaviorAnalysisInput.SessionTimeline(session.sessionId(),
                    session.startedAt(), session.endedAt(), session.integrity(), events));
        }
        var old = input.input();
        var data = new BehaviorAnalysisInput(old.schemaVersion(), old.datasetId(), old.generatedAt(), old.analysisWindow(),
                old.anonymousSubjectId(), sessions.size(), to - from, sessions);
        return new BehaviorAnalysisInputResponse(input.id(), input.schemaVersion(), input.generatedAt(), sessions.size(), to - from, data);
    }
    public AiBehaviorAnalysis analyze(BehaviorAnalysisInputResponse input, int limit, List<AiBehaviorAnalysisRun.Attempt> audit) {
        var chunks = partition(input, limit);
        List<AiBehaviorAnalysis> analyses = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            var chunk = chunks.get(i);
            analyses.add(call(prompts.userPrompt(chunk) + "\n구간 " + (i + 1) + "/" + chunks.size()
                    + ": 세션 일부일 수 있습니다. 구간 밖 행동을 가정하지 마세요.", chunk, audit, limit));
        }
        ObjectNode merge = (ObjectNode) mapper.readTree(prompts.userPrompt(slice(input, 0, 0)));
        merge.put("mergeInstruction", "모든 구간 해석을 통합하세요. 다수결/평균/성공률로 판단하지 말고 시간순 변화와 상충 근거를 검토하세요. "
                + "중간 해석은 원본을 대체하지 않으며 원문 직접 검토가 부족하면 보류하세요. 모든 실제 세션을 한 번씩 평가하세요.");
        merge.set("chunkAnalyses", mapper.valueToTree(analyses));
        merge.set("coverage", mapper.valueToTree(chunks.stream().map(c -> Map.of("eventCount", c.eventCount(),
                "sessions", c.input().sessions().stream().map(s -> Map.of("sessionId", s.sessionId(),
                "eventIds", s.events().stream().map(BehaviorAnalysisInput.EventTimeline::behaviorLogId).toList())).toList())).toList()));
        merge.set("evidenceCards", mapper.valueToTree(EvidenceIndex.retrieve("interface")));
        return call(mapper.writeValueAsString(merge), input, audit, limit);
    }
    private AiBehaviorAnalysis call(String prompt, BehaviorAnalysisInputResponse input,
            List<AiBehaviorAnalysisRun.Attempt> audit, int limit) {
        String system = prompts.systemPrompt();
        if (system.length() + prompt.length() + 100 > limit) throw new IllegalArgumentException("MERGE_INPUT_EXCEEDS_LIMIT");
        for (int attempt = 0; attempt < 2; attempt++) {
            String submitted = prompt + (attempt == 0 ? "" : "\n구조와 실제 사건 참조를 수정하세요.");
            String raw = null;
            try {
                var output = client.complete(system, submitted, 4500, 0.2);
                raw = output.text(); model = output.model();
                AiBehaviorAnalysis result = validator.validate(mapper.readerFor(AiBehaviorAnalysis.class)
                        .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                        .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readValue(raw), input);
                audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size() + 1, submitted, raw, null));
                return result;
            } catch (RuntimeException failure) {
                audit.add(new AiBehaviorAnalysisRun.Attempt(audit.size() + 1, submitted, raw,
                        raw == null ? "AI_UNAVAILABLE" : "INVALID_AI_ANALYSIS"));
                if (raw == null) throw new IllegalStateException("AI_UNAVAILABLE");
            }
        }
        throw new IllegalStateException("INVALID_AI_ANALYSIS");
    }
}

