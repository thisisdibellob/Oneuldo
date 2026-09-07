package oneuldo.behaviorlog.profile.service;

import java.util.LinkedHashMap;
import java.util.Map;
import oneuldo.behaviorlog.analysis.domain.AiBehaviorAnalysisResponse;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class AiUserProfilePromptFactory {
    public static final String VERSION = "incremental-user-profile-v2-broader";
    private final ObjectMapper mapper;

    public AiUserProfilePromptFactory(ObjectMapper mapper) { this.mapper = mapper; }

    public String systemPrompt() {
        return "생활기술 연습용 사용자 프로필을 갱신하는 AI다. 의료 진단·IQ·장애 등급·능력 점수를 만들지 않는다. "
                + "이전 프로필은 수정 가능한 가설이며 새 세션과 충돌하면 약화하거나 보류한다. 느림·반복·도움 요청만으로 부족함을 단정하지 않는다. "
                + "새 세션의 AI 관찰과 다른 설명·불확실성을 함께 반영한다. 사용자의 개인정보를 출력하지 않는다. 한국어 JSON 객체 하나만 출력한다.";
    }

    public String userPrompt(AiUserProfile previous, AiBehaviorAnalysisResponse current) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("promptVersion", VERSION);
        root.put("previousProfileVersion", previous.getProfileVersion());
        root.put("previousProfile", Map.of(
                "summary", previous.getProfile().summary(),
                "findings", previous.getProfile().findings(),
                "uncertainties", previous.getProfile().uncertainties(),
                "practicePlan", previous.getProfile().practicePlan(),
                "usedEvidenceCardIds", previous.getProfile().usedEvidenceCardIds()));
        root.put("newSessionAnalysis", current.analysis());
        root.put("updateRules", new String[]{
                "이전 프로필과 새 세션을 함께 반영한 누적 요약을 작성한다.",
                "기존 판단을 자동 확정하지 않고 유지·강화·약화·보류 가능성을 문장에 명확히 반영한다.",
                "findings는 서로 다른 근거가 있으면 2~3개 유지한다. 새 플레이의 한 항목으로 기존의 유효한 다른 관찰을 덮지 않는다. 근거가 적으면 항목 수도 줄이며 개수를 채우려고 행동을 만들지 않는다. 각 finding의 evidenceEventIds는 입력에 있는 최근·상충 근거 최대 3개를 사용한다.",
                "요약은 전체 경향과 변화가 드러나게 작성한다. 각 finding은 구체적 행동, 해석 이유, 실행 가능한 지원을 각각 완결된 문장으로 설명한다. 고정 글자 수 제한 대신 중복 표현을 줄여 출력 상한 안에서 JSON을 완성한다. 대안 설명은 항목마다 1개 이상, 자료 한계와 상충도 유지한다.",
                "새 세션 하나만으로 생활 전반의 능력을 일반화하지 않는다.",
                "다음 연습 계획은 현재 게임이 지원하는 난이도 1~3, 품목 2~4개 범위에서 제안한다."
        });
        root.put("outputContract", Map.of(
                "summary", "누적 관찰 요약",
                "findings", new Object[]{Map.of(
                        "id", "F1", "skill", "관찰된 생활기술", "observation", "누적 관찰 사실",
                        "interpretation", "확인이 필요한 가설", "alternativeExplanations", new String[]{"다른 설명"},
                        "evidenceEventIds", new String[]{"입력에 있는 실제 UUID"}, "suggestedSupport", "지원 제안")},
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
