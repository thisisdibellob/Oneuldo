package oneuldo.behaviorlog.personalization.service;

import java.util.Map;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The client and server package the same policy. Only legacy quests receive the default. */
public final class MarketQuestTimePolicy {
    private static final JsonNode POLICY = read();
    public static final String VERSION = POLICY.path("policyVersion").asString();
    public static final int MINIMUM_SECONDS = seconds("minimumSeconds");
    public static final int MAXIMUM_SECONDS = seconds("maximumSeconds");
    public static final int DEFAULT_SECONDS = seconds("defaultSeconds");
    private static final Pattern PROMPT_VERSION = Pattern.compile("^market-ai-quest-v(\\d+)(?:-|$)");

    static {
        if (VERSION.isBlank() || MINIMUM_SECONDS > DEFAULT_SECONDS || DEFAULT_SECONDS > MAXIMUM_SECONDS)
            throw new IllegalStateException("장보기 시간 정책 범위 오류");
    }

    private MarketQuestTimePolicy() {}

    public static Map<String, Object> context() {
        return Map.of("policyVersion", VERSION, "minimumSeconds", MINIMUM_SECONDS,
                "maximumSeconds", MAXIMUM_SECONDS, "defaultSeconds", DEFAULT_SECONDS);
    }

    public static boolean requiresExplicitLimit(String promptVersion) {
        if (promptVersion == null) return false;
        var match = PROMPT_VERSION.matcher(promptVersion);
        return match.find() && Integer.parseInt(match.group(1)) >= 20;
    }

    public static Integer responseLimit(Integer seconds, String promptVersion) {
        return seconds == null && !requiresExplicitLimit(promptVersion) ? Integer.valueOf(DEFAULT_SECONDS) : seconds;
    }

    private static int seconds(String field) {
        var value = POLICY.path(field);
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() <= 0)
            throw new IllegalStateException("장보기 시간 정책 정수 오류: " + field);
        return value.asInt();
    }

    private static JsonNode read() {
        try (var stream = MarketQuestTimePolicy.class.getResourceAsStream("/market/time-policy.json")) {
            if (stream == null) throw new IllegalStateException("장보기 시간 정책 누락");
            return JsonMapper.builder().build().readTree(stream);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("장보기 시간 정책 읽기 실패", exception);
        }
    }
}
