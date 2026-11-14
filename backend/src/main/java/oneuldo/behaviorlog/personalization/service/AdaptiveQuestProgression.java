package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Literal task differences only. A new task is not evidence of learner mastery. */
final class AdaptiveQuestProgression {
    private static final List<String> MECHANICS = List.of("objectives", "budget", "timeLimitSeconds",
            "runtimePlan/environment", "runtimePlan/learning", "runtimePlan/matchRule",
            "runtimePlan/stockPerProduct", "runtimePlan/stockOverrides", "environmentPlan/shelfOrder");
    private AdaptiveQuestProgression() {}

    static JsonNode latestMission(JsonNode evidence) {
        var tasks = evidence.path("recordedTasks");
        for (int n = tasks.size() - 1; n >= 0; n--)
            if (tasks.get(n).path("mission") instanceof ObjectNode mission) {
                var effective=mission.deepCopy();var actual=tasks.get(n).path("actualConditions");
                for(String field:List.of("runtimePlan","environmentPlan"))if(actual.path(field).isObject()&&!actual.path(field).isEmpty()) {
                    var merged=effective.path(field) instanceof ObjectNode old?old.deepCopy():new ObjectMapper().createObjectNode();
                    for(String key:actual.path(field).propertyNames())merged.set(key,actual.path(field).get(key).deepCopy());
                    effective.set(field,merged);
                }
                return effective;
            }
        return null;
    }

    static ObjectNode context(ObjectMapper mapper, JsonNode evidence) {
        var result = mapper.createObjectNode();
        result.put("scope", "Compare the latest actually played task, not old AI changeReasons. A meaningful new observation must change goals, playable conditions or actual support. Rephrasing, title, rationale, penalty values or budget headroom alone are not progress. Same supported success never proves mastery. Do not raise difficulty automatically.");
        var previous = latestMission(evidence);
        if (previous != null) {
            var task = result.putObject("latestPlayedConditions");
            for (String field : List.of("objectives", "budget", "timeLimitSeconds", "runtimePlan", "environmentPlan", "briefing"))
                if (previous.has(field)) task.set(field, previous.get(field).deepCopy());
            // Historical AI rationale/observation are not part of the actual playable conditions.
            if (task.path("environmentPlan") instanceof ObjectNode environment) environment.remove("rationale");
        }
        return result;
    }

    static ObjectNode comparison(ObjectMapper mapper, JsonNode evidence, JsonNode candidate) {
        var result = mapper.createObjectNode();
        var previous = latestMission(evidence);
        result.put("previousTaskAvailable", previous != null);
        var changes = result.putArray("changedMechanics");
        boolean allKnown = previous != null;
        if (previous != null) for (String field : MECHANICS) {
            var old = previous.at("/" + field); var current = candidate.at("/" + field);
            if (old.isMissingNode() || current.isMissingNode()) { allKnown = false; continue; }
            var oldValue = field.equals("objectives") ? objectiveMap(mapper, old) : old;
            var newValue = field.equals("objectives") ? objectiveMap(mapper, current) : current;
            if (!oldValue.equals(newValue)) changes.add("/" + field);
        }
        result.put("sameMechanics", allKnown && changes.isEmpty());
        // Price headroom alone does not change what is practised. Keep the ordinary
        // sameMechanics value for audit/backward-compatible review envelopes.
        result.put("budgetOnlyChange", allKnown && changes.size()==1 && changes.get(0).asString().equals("/budget"));
        result.put("sameInstructionText", previous != null && instructionText(previous).equals(instructionText(candidate)));
        if (previous != null) result.set("previousBriefing", previous.path("briefing").deepCopy());
        result.put("supportScope", "Compare actual instruction meaning. Sentence splits/paraphrases are unchanged support. A concrete cue added or removed may be a meaningful supported practice/check; it does not establish independence or mastery.");
        return result;
    }

    static void rejectExactRepeat(ObjectMapper mapper, JsonNode evidence, JsonNode candidate) {
        var compared = comparison(mapper, evidence, candidate);
        if ((compared.path("sameMechanics").asBoolean()||compared.path("budgetOnlyChange").asBoolean()) && compared.path("sameInstructionText").asBoolean())
            throw AdaptiveQuestContract.problem("/objectives", "UNCHANGED_RECOMMENDATION");
    }

    static void requirePlannedVariety(JsonNode practicePlan, JsonNode evidence, JsonNode candidate) {
        boolean variety = false;
        for (var code : practicePlan.path("reasonCodes")) if ("EXPLORE_CATEGORY_VARIETY".equals(code.asString())) variety = true;
        var previous = latestMission(evidence);
        if (!variety || previous == null) return;
        var oldCategories = categories(previous);
        if (!oldCategories.isEmpty() && oldCategories.containsAll(categories(candidate)))
            throw AdaptiveQuestContract.problem("/objectives", "CATEGORY_VARIETY_NOT_IMPLEMENTED");
    }

    private static Set<String> categories(JsonNode mission) {
        var result = new HashSet<String>();
        for (var item : mission.path("objectives"))
            for (var product : MarketQuestCatalog.PRODUCTS)
                if (product.id().equals(item.path("productId").asString())) result.add(product.categoryId());
        return result;
    }

    static List<Map<String,Object>> reviewIssues(ObjectMapper mapper, JsonNode evidence, JsonNode candidate, JsonNode review) {
        var compared = comparison(mapper, evidence, candidate);
        var check = review.path("progressionCheck");
        if (!check.isObject() || !check.path("sameMechanics").equals(compared.path("sameMechanics"))
                || !Set.of("INCREASED", "REDUCED", "UNCHANGED", "UNDETERMINED").contains(check.path("supportChange").asString())
                || !check.path("questionImplemented").isBoolean()
                || !check.path("explanation").isString() || check.path("explanation").asString().isBlank()
                || check.path("explanation").asString().length() > 500)
            throw AdaptiveQuestContract.problem("/adaptationSummary", "INVALID_PROGRESSION_REVIEW");
        boolean repeatedConditions=(compared.path("sameMechanics").asBoolean()||compared.path("budgetOnlyChange").asBoolean())
                && !Set.of("INCREASED", "REDUCED").contains(check.path("supportChange").asString());
        if (!check.path("questionImplemented").asBoolean() || repeatedConditions)
            return List.of(Map.of("path", "/objectives", "code", repeatedConditions?"UNCHANGED_RECOMMENDATION":"PRACTICE_CONDITIONS_NOT_IMPLEMENTED",
                    "explanation", "직전 과제와 실질적으로 같은 반복이거나 평가 목적이 실제 조건에 구현되지 않았습니다. 목표·조건 또는 실제 지원을 변경하고 관련 설명을 다시 맞추세요.", "sourceEvidenceIds", List.of()));
        return List.of();
    }

    private static ObjectNode objectiveMap(ObjectMapper mapper, JsonNode objectives) {
        var result = mapper.createObjectNode();
        for (var item : objectives) result.set(item.path("productId").asString(), item.path("quantity"));
        return result;
    }
    private static String instructionText(JsonNode mission) {
        var text = new StringBuilder();
        for (var line : mission.path("briefing")) text.append(line.asString());
        return text.toString().replaceAll("\\s+", "");
    }
}
