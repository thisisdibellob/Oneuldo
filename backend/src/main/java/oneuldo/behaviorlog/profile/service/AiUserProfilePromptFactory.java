package oneuldo.behaviorlog.profile.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class AiUserProfilePromptFactory {
    public static final String VERSION = "incremental-user-profile-v54-source-consistency";
    private final ObjectMapper mapper;

    public AiUserProfilePromptFactory(ObjectMapper mapper) { this.mapper = mapper; }

    public String withPracticeHistory(String prompt, tools.jackson.databind.JsonNode history) {
        var original = (tools.jackson.databind.node.ObjectNode)mapper.readTree(prompt);
        var root = mapper.createObjectNode();
        root.set("promptVersion", original.path("promptVersion"));
        root.put("sourcePriority", "먼저 실제 과제·제출·지원 원본을 확인한다. historyOutcomeSources의 장바구니와 목표별 실제 수량은 과거 결과의 직접 원본이다. 빈 장바구니·선택 수량 없음인데 과거 목표를 정확히 구매·완료·성공했다고 쓰지 않는다. 제출이나 FLOW_FINISHED는 목표 성공이 아니다. ~T숫자는 전송 인코딩 표기이며 세션 이름으로 복사하지 않는다. currentAnalysis도 AI 해석이며 원본과 충돌하면 정정한다. "
                + "previousProfile은 과거 AI가 작성한 관찰 요약의 간접 보고이며 원본 행동 기록이 아니다. 재분석·과거 동일 출처의 재해석 이력·출처 이력 미확인 갱신에서는 이전 관찰 문장도 제외했다. "
                + "이전 요약·인지 해석·대안 설명·불확실성·연습 계획·지원 제안은 입력에서 제외했다. 실제 적용된 지원은 recordedPractice에서 확인한다.");
        root.put("groundedPracticeContractVersion", "v1");
        root.set("implementedSupportCapabilities", oneuldo.behaviorlog.analysis.service.SourceBoundReviewChecks.promptCapabilities(mapper));
        root.set("currentTaskComparisonSource", currentTaskComparisonSource(history));
        root.put("sessionSourceLedgerRule", oneuldo.behaviorlog.analysis.service.SessionSourceLedger.RULE);
        root.put("currentTaskComparisonScope", "이번 분석 대상 실제 플레이의 목표별 허용 상품·규격·수량, 제출, 제공된 문장을 나란히 복사한 원본 자료다. "
                + "성패나 일치 여부를 계산한 표가 아니다. 허용 목록에 없는 ID를 과거 AI 설명 때문에 포함됐다고 추가하지 않는다. "
                + "판매 중인 상품이나 제출 가능한 상품이라는 사실과 목표의 허용 상품이라는 조건을 구분한다. 근거 인용 권한을 추가하는 자료가 아니다.");
        var rawHistory = history == null ? mapper.createArrayNode() : history.deepCopy();
        for (var row : rawHistory) if (row instanceof tools.jackson.databind.node.ObjectNode object)
            object.remove("priorAiJudgment");
        root.set("practiceHistory", rawHistory);
        root.put("movementHistoryScope", oneuldo.behaviorlog.analysis.service.MovementSourceContext.HISTORY_SCOPE);
        root.put("timingHistoryScope", oneuldo.behaviorlog.analysis.service.AnalysisSourceContext.TIME_EVENTS);
        for (String field : original.propertyNames()) if (!"promptVersion".equals(field))
            root.set(field, original.get(field));
        root.put("practiceHistoryScope", "최근 최대12개 서로 다른 실제 플레이의 과제·안내·구매 원본이다. 완전한 평생 이력이 아니므로 여기에 없다는 이유로 과거 오류의 해결이나 처음 등장한 품목이라고 판단하지 않는다. 같은 세션 재분석은 반복 플레이로 세지 않는다. "
                + "과거 AI 성패 표시는 제외했다. 목표별 원본 요구와 최종 제출을 직접 대조하며 없는 이력을 실패나 성공으로 채우지 않는다. "
                + "이번 분석 대상과 다른 실제 세션의 목표·실제 구매·제공된 안내를 비교해 반복된 어려움과 바꿀 부담/지원 조건을 AI가 선택한다. recordedInstructionEvents는 실제 안내 전환·계산 진입·도움 요청 사건이며 읽기·이해·도움 의존 판정이 아니다. mission의 안내 원문과 briefingIndex를 대조하되 안내 존재만으로 사용자의 읽기를 확정하지 않는다. "
                + "이 이력은 맥락 자료다. 프로필 근거는 별도로 허용된 evidenceEventIds만 사용한다. 세션은 sessionId로 식별하며 sourceDatasetId는 원본 스냅샷의 출처다. "
                + "currentSession=true와 currentSessionMeaning=CURRENT_ANALYSIS_TARGET_NOT_LATEST_PLAY는 이번 분석 대상이라는 뜻이며 가장 최근에 수행한 플레이라는 뜻이 아니다. 과거 세션 재분석이 현재 대상으로 표시될 수 있다. "
                + "recordedSessionStartedAt·recordedSessionEndedAt은 실제 세션 원본 시각이다. orderingScope=RECORDED_SESSION_START_WITH_PROFILE_LINK_TIEBREAK이면 원본 시작 시각 순서이며 동률만 연결 순서를 따른다. "
                + "orderingScope=PROFILE_LINK_ORDER_SOURCE_TIME_MISSING이면 원본 시작 시각 일부가 없어 프로필 연결 순서만 유지했다. 이 순서를 실제 플레이 발생 순서나 전후 학습 변화로 단정하지 않는다. "
                + "playOrder는 자료 배열의 순번이며 새 플레이·추가 성공·숙달 횟수가 아니다. 이번 분석 대상 플레이와 다른 실제 플레이를 구분하고 원본 시각이 있을 때만 실제 이전·이후로 설명한다. "
                + "본문에 세션 UUID나 S/R 번호, 번호 범위를 나열하지 않는다. 장바구니 열기는 열었다고만 적는다. 내용을 확인했다/식별하지 못했다는 인지 과정으로 바꾸지 않는다. 실제 제출 상품이 목표와 달랐다는 관측 결과를 설명한다. 한 품목을 먼저 연습하더라도 다른 품목 오류가 해결된 것으로 지우지 않는다. 연습 효과는 아직 검증되지 않은 가설로 남긴다.");
        root.set("retrievedKnowledge", oneuldo.behaviorlog.analysis.service.KnowledgeRetrieval.retrieve(root.path("practiceHistory")));
        oneuldo.behaviorlog.analysis.service.PracticeDesignContract.attach(mapper,root,root.path("currentTaskComparisonSource"));
        return mapper.writeValueAsString(oneuldo.behaviorlog.analysis.service.LosslessHistoryEncoding.encode(mapper, root));
    }

    private tools.jackson.databind.node.ArrayNode currentTaskComparisonSource(tools.jackson.databind.JsonNode history) {
        var result = mapper.createArrayNode();
        if (history == null) return result;
        for (var play : history) {
            if (!play.path("currentSession").asBoolean()) continue;
            var practice = play.path("recordedPractice");
            if (!practice.isObject()) continue;
            var row = result.addObject();
            if (play.has("sessionId")) row.set("sessionId", play.get("sessionId"));
            if (practice.has(oneuldo.behaviorlog.analysis.service.SessionSourceLedger.FIELD))
                row.set(oneuldo.behaviorlog.analysis.service.SessionSourceLedger.FIELD, practice.get(oneuldo.behaviorlog.analysis.service.SessionSourceLedger.FIELD));
            if (play.has("playOrder")) row.set("playOrder", play.get("playOrder").deepCopy());
            var requirements = row.putArray("requirements");
            var instructions = row.putArray("providedText");
            for (var task : practice.path("tasks")) {
                var mission = task.path("mission");
                var requirement = mapper.createObjectNode();
                for (String field : java.util.List.of("objectives", "budget", "timeLimitSeconds", "catalogVersion", "briefing"))
                    if (mission.has(field)) requirement.set(field, mission.get(field).deepCopy());
                if (!requirement.isEmpty()) requirements.add(requirement);
                var text = mapper.createObjectNode();
                for (String field : java.util.List.of("briefing", "checkoutDialogue"))
                    if (mission.has(field)) text.set(field, mission.get(field).deepCopy());
                if (!text.isEmpty()) instructions.add(text);
            }
            var products = row.putArray("selectedProducts");
            var submissions = row.putArray("submissions");
            for (var event : practice.path("purchaseEvents")) {
                if (event.has("selectedProduct")) products.add(event.get("selectedProduct").deepCopy());
                if ("SHOP.CHECKOUT_SUBMITTED".equals(event.path("eventCode").asString()))
                    submissions.add(event.deepCopy());
            }
            var expired = row.putArray("timeLimitExpiredEvents");
            for (var event : practice.path("purchaseEvents"))
                if ("SHOP.TIME_LIMIT_EXPIRED".equals(event.path("eventCode").asString())) expired.add(event.deepCopy());
            if (practice.has("timingEvents")) row.set("timingEvents", practice.get("timingEvents").deepCopy());
        }
        return result;
    }

    public String systemPrompt() {
        return oneuldo.behaviorlog.analysis.service.GroundedPracticeContract.RULE + "ONE-LINE JSON. 출력은 summary, findings, uncertainties, practicePlan, usedEvidenceCardIds라는 최상위 필드 5개만 가진 JSON 객체다. "
                + "sessionAssessments는 currentAnalysis의 입력 분석값이며 프로필 출력에 포함하지 않는다. 별도 analysis/result 같은 외부 감싸기 필드도 만들지 않는다. "
                + "각 finding의 필수 필드는 id, skill, observation, interpretation, alternativeExplanations, evidenceEventIds, suggestedSupport입니다. id/skill/observation/interpretation/suggestedSupport는 각각 비어 있지 않은 문자열이며 suggestedSupport를 생략하지 마세요. alternativeExplanations와 evidenceEventIds만 배열입니다. "
                + "출력 계약: 각 finding의 evidenceEventIds 배열은 실제로 인용할 R 번호 1~30개다. "
                + "allowedEvidenceEventIds는 선택 가능한 목록이지 모두 출력해야 하는 목록이 아니다. "
                + "한 관찰에 목록 전체를 붙이지 말고 해당 관찰을 지지하는 근거를 선택한다. "
                + "과거 실패와 이번 성공처럼 서로 다른 관찰은 각각 작성하고 각각의 근거를 인용한다. "
                + "출력 전에 각 배열의 개수를 확인한다. 31개 이상인 배열은 유효한 출력이 아니다. "
                + "생활기술 연습용 사용자 프로필을 갱신하는 AI다. 의료 진단·IQ·장애 등급·능력 점수를 만들지 않는다. "
                + "과거 AI 관찰 요약도 원본으로 확인할 간접 보고다. 이전 AI의 성공·실패·인지 가설을 원본 사실로 간주하지 않고 실제 기록과 충돌하면 정정하거나 보류한다. 느림·반복·도움 요청만으로 부족함을 단정하지 않는다. "
                + "이동 로그 개수는 수집·축약·입력 조건에 따른 기록 수이며 헤맴 횟수가 아니다. 각 플레이의 실제 배치·목표·동선·장애물·NPC·지원·입력 출처를 함께 보고 미기록 원인이나 실제 학습자 능력을 만들어 누적하지 않는다. "
                + "상품별 정확한 선택·수정과 전체 과제 성공을 구분한다. 과거 수정은 과거의 실제 지원 조건과 함께 설명하며, 이번 처음부터 맞춘 선택으로 이전 전체 과제를 성공으로 바꾸지 않는다. "
                + "현재 분석의 AI 관찰과 다른 설명·불확실성을 함께 반영한다. sameSessionReanalysis=true이면 같은 플레이의 해석 정정이며 "
                + "이번 세션의 이전 AI 해석은 비교할 별도 플레이가 아니다. 실제로 다른 세션의 원본만 비교하며 새 프로필을 다시 작성한다. "
                + "프로필 버전·분석 ID·데이터셋 ID 변경은 추가 플레이가 아니며 이전 해석과 현재 해석을 반복 성공·재현·안정적 유지·새 학습·숙달 근거로 합치지 않는다. "
                + "근거는 allowedEvidenceEventIds의 R 번호만 인용한다. 문장 속 옛 E/R 번호는 인용하지 않는다. 본문에 번호를 반복하지 말고 evidenceEventIds에만 쓴다. "
                + oneuldo.behaviorlog.analysis.service.AnalysisSourceContext.TIMING
                + "기존 또는 새 분석의 심리적 추측을 사실로 누적하지 않는다. 해석은 원본 행동과 과제 목표의 관계를 설명하고 직접 근거 없는 이해·동기 후보는 만들지 않고 원인 미확인만 적는다. 사용자의 개인정보를 출력하지 않는다. 한국어 JSON 객체 하나만 출력한다.";
    }

    public String userPrompt(AiUserProfile previous, AiBehaviorAnalysisResponse current) {
        var currentSources = current.analysis().sessionAssessments().stream()
                .map(s -> new SourceSession(s.sessionId(), current.datasetId(), current.analysisId())).toList();
        boolean same = currentSources.stream().anyMatch(s -> s.sessionId().equals(previous.getSourceSessionId()));
        var priorSources = same ? List.<SourceSession>of() : List.of(new SourceSession(
                previous.getSourceSessionId(), previous.getSourceDatasetId(), previous.getSourceAnalysisId()));
        return userPrompt(previous, current, new UpdateSourceContext(same,
                previous.getPreviousProfileId() == null, false, currentSources, priorSources));
    }

    /** Identity/provenance only. No outcome counts, ability levels or improvement decisions. */
    public record SourceSession(UUID sessionId, UUID datasetId, UUID analysisId) {}
    public record UpdateSourceContext(boolean sameSessionReanalysis, boolean sourceHistoryComplete,
            boolean priorSourceRevisionsPresent,
            List<SourceSession> currentSources, List<SourceSession> priorDistinctSources) {
        List<UUID> sessionIds() {
            return java.util.stream.Stream.concat(currentSources.stream(), priorDistinctSources.stream())
                    .map(SourceSession::sessionId).distinct().toList();
        }
    }

    public String userPrompt(AiUserProfile previous, AiBehaviorAnalysisResponse current, UpdateSourceContext sources) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("promptVersion", VERSION);
        root.put("currentAnalysis", current.analysis());
        root.put("previousProfileVersion", previous.getProfileVersion());
        root.put("previousSourceSessionId", previous.getSourceSessionId());
        root.put("sameSessionReanalysis", sources.sameSessionReanalysis());
        root.put("profileUpdateKind", sources.sameSessionReanalysis() ? "REINTERPRET_EXISTING_PLAY"
                : sources.sourceHistoryComplete() ? "ADD_DISTINCT_SOURCE_SESSION" : "SOURCE_HISTORY_UNRESOLVED");
        root.put("sourceHistoryComplete", sources.sourceHistoryComplete());
        root.put("priorSourceRevisionsPresent", sources.priorSourceRevisionsPresent());
        root.put("sourceSessionProvenance", Map.of("current", sources.currentSources(),
                "priorDistinct", sources.priorDistinctSources()));
        root.put("profileComparisonScope", "sourceSessionProvenance는 실제 sourceSessionId로 구분한 출처 목록이며 성패·능력 판정이 아니다. sourceHistoryComplete는 연결 ID의 탐색 완료일 뿐 행동 원본 범위의 완전성을 보증하지 않는다. "
                + "이전 프로필 버전은 처리 이력이다. 분석·데이터셋·프로필이 달라도 같은 sessionId는 하나의 실제 플레이다. "
                + "같은 세션이 프로필 연결 이력 어디에 있든 이번 요청은 그 플레이의 해석 교체이며 새로운 성공·학습 근거를 추가하지 않는다. "
                + "재분석에서는 이번 세션을 포함할 수 있는 이전 누적 AI 관찰 문장을 모두 제외했다. currentAnalysis와 서로 다른 실제 practiceHistory 원본으로 프로필을 다시 작성한다. "
                + "새 세션이어도 과거 출처 연결에 같은 세션의 재해석 버전들이 있으면 반복 성공 주장 오염을 막기 위해 이전 누적 문장을 제외한다. 버전들이 늘었다는 사실을 추가 플레이로 복원하지 않는다. "
                + "이번 원본으로 과거 AI의 반복 성공·유지·숙달 주장을 복원하지 않는다. 서로 다른 세션의 비교는 해당 원본 조건·행동이 있을 때만 작성한다. "
                + "출처 연결이 미완료이면 새 플레이라고 확정하지 않는다. 최근 원본 범위 밖 과거 관찰은 확인할 수 없으며 해결·성공으로 채우지 않는다.");
        var previousFindings = mapper.createArrayNode();
        boolean previousObservationIncluded = !sources.sameSessionReanalysis() && sources.sourceHistoryComplete()
                && !sources.priorSourceRevisionsPresent();
        if (previousObservationIncluded) for (var finding : mapper.valueToTree(previous.getProfile().findings())) {
            var report = previousFindings.addObject();
            for (String field : java.util.List.of("id", "skill", "observation", "evidenceEventIds"))
                if (finding.has(field)) report.set(field, finding.get(field).deepCopy());
        }
        root.put("previousProfile", Map.of(
                "observationsIncluded", previousObservationIncluded,
                "memoryScope", previousObservationIncluded
                        ? "과거 AI 관찰 요약의 간접 보고다. 실제 목표·제출·안내 기록과 대조할 후보이며 원본 사실이나 새 성패 판정이 아니다."
                        : "재분석·과거 동일 출처의 재해석 이력·출처 이력 미확인 갱신이므로 이전 누적 AI 관찰 문장은 제외했다. 서로 다른 실제 세션의 원본 practiceHistory를 보존해 새 프로필을 작성한다.",
                "findings", previousFindings));
        root.put("planningProcess", "① 이번 과제의 각 목표·허용 상품·규격·수량·예산과 실제 제출을 원본으로 대조한다. "
                + "② 이전 AI 관찰 보고가 입력에 있을 때만 실제 과거·현재 원본과 대조해 충돌하는 보고를 정정하거나 보류한다. 관찰 문장이 제외됐으면 추정해 복원하지 않는다. 다른 품목의 성공으로 미해결 요구를 해결했다고 쓰지 않는다. "
                + "③ 그 결과로 누적 findings와 다음 practicePlan을 새로 작성한다. currentAnalysis의 계획은 검토할 최근 제안이며 그대로 복사해야 하는 답이 아니다. "
                + "④ rationale에 선택한 초점, 최근 실제 지원 조건, 이번에 바꿀 부담 또는 안내와 관찰할 행동을 연결한다. "
                + "동일 조건을 유지할 때는 앞선 플레이로 답하지 못한 구체적인 확인 질문을 적는다. 제목만 바꾸는 것은 지원 변경이 아니다. "
                + "유지·수정·보류와 다음 초점·지원 수준은 AI가 선택하며 성공 횟수로 자동 승급하거나 동일 과제를 무조건 금지하지 않는다. "
                + "출력 스키마는 성패 판정 필드를 수정하지 않는다. currentAnalysis.sessionAssessments가 원본과 충돌하면 findings와 uncertainties에 상충을 명시하고 그 판정으로 지원을 줄이지 않는다. 성패 정정은 세션 분석에서 다시 검토해야 한다.");
        root.put("sourceScope", "previousProfile.observationsIncluded=true일 때에만 과거 AI 관찰 요약의 간접 보고가 있다. false이면 누적 관찰 문장을 제외했으며 복원하지 않는다. 그것도 원본으로 확인해야 하며 이번 행동 기록이 아니다. 과거 도움 요청·오답을 현재 세션에 복사하지 않는다. "
                + "이전 실패와 현재 성공을 모두 성공으로 합치지 않는다. 새 분석과 과거가 충돌하면 무엇이 달라졌고 무엇은 모르는지 구분한다. "
                + "이전 불확실성 문장은 그대로 전달하지 않는다. 오래된 요구의 원본이 현재 자료 범위에 없어 확인할 수 없다면 그 범위 한계를 uncertainties에 새로 설명한다. 기존 인지 가설이나 허용 목록 추측을 복원하지 않고 없는 원본 근거에 새 evidenceEventIds를 부여하지 않는다. "
                + "장바구니 열기는 읽기·목록 대조·절차 이해를 입증하지 않는다. uncertainties에 미확인이라 쓴 이해·의도를 본문에서 확정하지 않는다. "
                + "최근 두 번의 정확한 선택도 일반 능력 확보나 교육 효과의 증거로 확대하지 않는다.");
        root.put("learningEvidence", oneuldo.behaviorlog.analysis.service.LearningEvidenceGuidance.OBSERVATION
                + oneuldo.behaviorlog.analysis.service.LearningEvidenceGuidance.PRACTICE);
        root.put("eventSemantics", new oneuldo.behaviorlog.analysis.service.AiBehaviorAnalysisPromptFactory(mapper).marketEventSemantics());
        root.put("movementEvidence", oneuldo.behaviorlog.analysis.service.MovementSourceContext.RULE
                + " practiceHistory.recordedPractice.sourceMovementContext는 각 실제 플레이의 원본 맥락이다. 이전 AI가 헤맸다고 요약한 문장은 이 맥락으로 재검토한다. 과거 배치·입력·지원 원본이 없으면 비교할 수 없다는 한계를 남긴다.");
        root.put("practiceCapabilities",oneuldo.behaviorlog.analysis.service.AdaptiveObservationGuidance.RULE);
        root.put("planSourceBoundaries", "rationale도 관찰된 차이·원인 미확인·제안할 연습을 구분한다. 규격 불일치를 구분 능력 부족으로, 도움말 열기를 읽기·사용·의존으로, 한 번 수정한 성공을 독립 숙달·확신 향상으로 바꾸지 않는다. "
                + "미확인 원인을 uncertainties에 남기고 계획에서는 확정하지 않는다. 제공되는 환경·과제 기능은 practiceCapabilities에 명시된 범위다. 색상 강조·음성·새 지도·버튼을 구현된 지원으로 약속하지 않는다. "
                + "COMPLETED/FLOW_FINISHED/EXIT_AFTER_SUBMISSION는 흐름 종료 표기이며 목표 달성 근거가 아니다. 미기록 과거 난도/지원 수준을 채우지 말고 실제 목표와 안내 문장을 비교한다. "
                + "같은 요구를 반복한 성공과 다른 상품/규격에서의 전이 확인은 구분한다. 다음 계획에는 반복·지원 감소·전이 관찰의 선택 이유와 아직 답하지 못한 행동 질문을 쓰고 성공 횟수만으로 진도를 올리지 않는다.");
        root.put("updateRules", new String[]{
                "sameSessionReanalysis=true이면 동일 플레이의 분석 정정이다. 새 플레이·추가 성공·교육 효과·능력 향상으로 세지 않는다. 새 분석이 원본 근거로 정정한 기존 해석을 누적 사실로 남기지 말고 정정 또는 보류한다. 이전 프로필과 현재 분석을 서로 다른 성공으로 비교하지 않는다.",
                "서로 다른 실제 세션의 원본과 이번 분석을 함께 반영한 누적 요약을 새로 작성한다. 관찰 문장이 제외된 이전 프로필의 반복 성공·유지·숙달 주장을 추정해 복원하지 않는다.",
                "기존 판단을 자동 확정하지 않고 유지·강화·약화·보류 가능성을 문장에 명확히 반영한다.",
                "이전 findings의 미해결 요구를 이번 과제에서 다시 수행했는지 대조한다. 미재검사 요구는 해결됐다고 삭제하지 말고 finding 또는 uncertainties에 유지한다. 목표에서 빠진 품목에 대한 오류는 다른 품목 성공으로 해결되지 않는다. 오래된 근거가 인용 범위에 없으면 새 근거를 만들어 붙이지 말고 uncertainties에 과거 관찰의 미재검사 상태를 적는다.",
                "practiceHistory의 실제 안내와 제출을 함께 대조해 성공한 지원 조건을 갱신한다. 목표 목록만 제공된 성공을 구체적 비교·수정 안내에 의존한 성공으로 다시 분류하지 않는다. 추가 힌트가 없었던 동일 조건의 성공을 기록한 뒤 또 같은 독립 검사를 제안하려면 앞선 관찰이 답하지 못한 질문을 rationale에 명시한다.",
                "다음 practicePlan은 미해결·미재검사 요구와 확인된 성공을 모두 보고 우선순위를 AI가 정한다. 성공한 우유 선택의 내면 이해가 미확인이라는 이유만으로 바나나 묶음 오류를 매번 뒤로 미루지 않는다. 품목을 바꿀 필요가 있는지, 부담을 줄일지, 지원을 줄일지는 실제 근거로 선택한다. 이전 practicePlan은 다음 과제 제안이지 실제 적용된 지원의 증거가 아니다.",
                "findings는 서로 다른 근거가 있으면 2~3개 유지한다. 새 플레이의 한 항목으로 기존의 유효한 다른 관찰을 덮지 않는다. 근거가 적으면 항목 수도 줄이며 개수를 채우려고 행동을 만들지 않는다. 각 finding은 하나의 구체적 관찰을 작성하고 evidenceEventIds에는 그 관찰의 실제 근거 1~30개를 선택한다. 동일 행동의 중복 기록 전체를 나열할 필요는 없으며, 상충 결과의 근거는 함께 남긴다. 서로 다른 상품·행동·세션의 모든 근거를 한 finding에 몰아넣지 않는다.",
                "요약은 전체 경향과 변화가 드러나게 작성한다. 각 finding은 구체적 행동, 해석 이유, 실행 가능한 지원을 각각 완결된 문장으로 설명한다. 고정 글자 수 제한 대신 중복 표현을 줄여 출력 상한 안에서 JSON을 완성한다. 대안 설명은 원본 근거가 있는 경우에만 쓴다. 없으면 alternativeExplanations는 []이며, 동기·이해도 미확인은 uncertainties에 쓴다. 대안의 개수를 채우지 않는다. 자료 한계와 상충도 유지한다.",
                "새 세션 하나만으로 생활 전반의 능력을 일반화하지 않는다.",
                "다음 연습 계획은 현재 게임이 지원하는 난이도 1~3, 품목 1~4개 범위에서 제안한다."
        });
        root.put("outputContract", Map.of(
                "summary", "누적 관찰 요약",
                "findings", new Object[]{Map.of(
                        "id", "F1", "skill", "관찰된 생활기술", "observation", "누적 관찰 사실",
                        "interpretation", "관찰 행동과 과제 요구의 관계", "alternativeExplanations", new String[]{},
                        "evidenceEventIds", new String[]{"R1"}, "suggestedSupport", "지원 제안")},
                "uncertainties", new String[]{"자료 한계"},
                "practicePlan", Map.of(
                        "targetFindingIds", new String[]{"F1"}, "goal", "다음 연습 목표", "rationale", "근거와 목표 연결",
                        "recommendedDifficulty", 1, "itemCount", 2, "quantityComplexity", "LOW",
                        "budgetPressure", "LOW", "textSupport", "SIMPLIFIED",
                        "reasonCodes", new String[]{"OBSERVATION_PRACTICE"}),
                "usedEvidenceCardIds", new String[]{}));
        return mapper.writeValueAsString(root);
    }
}
