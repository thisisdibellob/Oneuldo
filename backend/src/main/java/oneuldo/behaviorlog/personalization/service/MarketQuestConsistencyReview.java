package oneuldo.behaviorlog.personalization.service;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestDraft;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestRequest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Arithmetic and literal source comparisons for an AI review, never a learner assessment. */
public final class MarketQuestConsistencyReview {
    public static final List<String> DIMENSIONS = List.of("OBJECTIVES", "BUDGET", "TIME", "SUPPORT", "SHELVES", "HISTORY", "PURPOSE");
    static final Set<String> ISSUE_CODES = Set.of("OBJECTIVE_TEXT_MISMATCH", "QUANTITY_CLAIM_MISMATCH",
            "BUDGET_CLAIM_MISMATCH", "TIME_CLAIM_MISMATCH", "SUPPORT_CLAIM_MISMATCH", "SHELF_CLAIM_MISMATCH",
            "UNSUPPORTED_HISTORY_CLAIM", "UNEXPLAINED_REPEAT", "PLAN_IMPLEMENTATION_MISMATCH");
    private static final Set<String> BUDGET_RELATIONS = Set.of("UNCHANGED", "INCREASED", "DECREASED", "UNSPECIFIED", "UNKNOWN");
    private MarketQuestConsistencyReview() {}

    public static ObjectNode context(ObjectMapper mapper, MarketAiQuestDraft draft, JsonNode semanticPrompt,
            MarketAiQuestRequest.EnvironmentContext environment) {
        var root = mapper.createObjectNode();
        root.put("reviewPurpose", "DELIVERED_QUEST_CONSISTENCY");
        root.set("deliveredQuest", mapper.valueToTree(draft));
        var facts = root.putObject("candidateFacts");
        int quantity = 0, cost = 0;
        var items = facts.putArray("lineItems");
        for (var objective : draft.objectives()) {
            var product = MarketQuestCatalog.require(objective.productId());
            int subtotal = product.price() * objective.quantity();
            quantity += objective.quantity(); cost += subtotal;
            var item = items.addObject().put("productId", product.id()).put("name", product.name())
                    .put("detail", product.detail()).put("salesUnit", product.salesUnit())
                    .put("quantity", objective.quantity()).put("unitPrice", product.price()).put("subtotal", subtotal);
            item.put("categoryId", product.categoryId());
        }
        facts.put("objectiveCount", draft.objectives().size());
        facts.put("objectiveQuantityTotal", quantity);
        facts.put("objectiveCostTotal", cost);
        facts.put("budget", draft.budget());
        facts.put("budgetSlack", draft.budget() - cost);
        facts.put("timeLimitSeconds", draft.timeLimitSeconds());
        facts.put("difficulty", draft.difficulty());
        facts.set("plannedShelfOrder", mapper.valueToTree(draft.environmentPlan().shelfOrder()));
        var assignments = facts.putArray("plannedSlotAssignments");
        for (int i = 0; i < draft.environmentPlan().shelfOrder().size(); i++) {
            var assignment = assignments.addObject().put("categoryId", draft.environmentPlan().shelfOrder().get(i));
            assignment.put("slotId", environment == null ? MarketAiQuestValidator.SHELF_SLOT_IDS.get(i) : environment.shelfSlots().get(i).slotId());
            if (environment != null) {
                var slot = environment.shelfSlots().get(i);
                assignment.put("x", slot.x()).put("y", slot.y()).put("orientation", slot.orientation());
            }
        }
        if (environment != null) facts.put("sameCategoryOrderAsCurrentEnvironment", environment.shelfSlots().stream()
                .map(MarketAiQuestRequest.ShelfSlot::categoryId).toList().equals(draft.environmentPlan().shelfOrder()));
        facts.put("shelfAssignmentScope", "이번 출력의 요청 배정과 현재 원본 자리의 문자 비교다. 실제 적용·이동 거리·동선 효과를 확정하지 않는다. 원본 없는 위치는 채우지 않는다.");
        facts.put("quantityScope", "상품 구매 단위 수의 합이다. 포장 안 낱개 수·용량·개념 숙달·난이도 점수가 아니다.");
        root.set("aiPracticePlan", semanticPrompt.path("aiDifficultyRecommendation").deepCopy());
        root.set("aiUserAnalysis", semanticPrompt.path("aiUserAnalysis").deepCopy());
        root.set("currentEnvironmentContext", mapper.valueToTree(environment));
        var previous = root.putArray("practiceHistoryFacts");
        // Preserve every distinct recorded mission. Multiple snapshots of identical text are not plays or support changes.
        for (var play : semanticPrompt.path("practiceHistory")) {
            var row = previous.addObject();
            for (String field : List.of("sessionId", "playOrder", "currentSession", "sourceAvailable", "recordedSessionStartedAt", "orderingScope"))
                copy(play, field, row);
            var source = play.path("recordedPractice");
            var missions = row.putArray("recordedTasks");
            Set<JsonNode> seen = new HashSet<>();
            for (var task : source.path("tasks")) {
                var mission = task.path("mission");
                if (!mission.isObject() || !seen.add(mission)) continue;
                var recorded = missions.addObject();
                recorded.set("mission", mission.deepCopy());
                var total = quantityTotal(mission.path("objectives"));
                if (total != null) recorded.put("objectiveQuantityTotal", total);
                var comparison = recorded.putObject("literalComparisonToCandidate");
                var oldObjectives = objectiveMap(mission.path("objectives"));
                var newObjectives = objectiveMap(root.path("deliveredQuest").path("objectives"));
                if (oldObjectives != null) {
                    comparison.put("sameObjectivesAndQuantities", oldObjectives.equals(newObjectives));
                    comparison.put("sameProductIds", oldObjectives.keySet().equals(newObjectives.keySet()));
                }
                if (mission.path("difficulty").isIntegralNumber()) comparison.put("sameDifficulty", mission.path("difficulty").asInt() == draft.difficulty());
                if (mission.path("budget").isIntegralNumber()) comparison.put("sameBudget", mission.path("budget").asInt() == draft.budget());
                if (mission.path("timeLimitSeconds").isIntegralNumber())
                    comparison.put("sameTimeLimit", mission.path("timeLimitSeconds").asInt() == draft.timeLimitSeconds());
                String oldInstructions = instructionText(mission), newInstructions = instructionText(root.path("deliveredQuest"));
                if (oldInstructions != null) comparison.put("sameInstructionTextIgnoringWhitespaceAndSentenceSplits", oldInstructions.equals(newInstructions));
                comparison.put("scope", "원본 값의 동일 여부만 계산한다. 문장 수·줄바꿈·품목 수 감소는 지원 감소 판정이 아니다. 서로 다른 문장도 같은 힌트일 수 있어 AI가 내용으로 대조한다.");
            }
            for (String field : List.of("purchaseEvents", "submittedProductDetails", "timingEvents", "timeLimitExpiredEvents", "sourceMovementContext"))
                copy(source, field, row);
        }
        root.set("budgetComparisonSource", budgetComparisonSource(mapper, root));
        root.set("observationComparisonSource", observationComparisonSource(mapper, root));
        root.put("supportCapabilityScope", "현재 지원은 문자 안내·상품/수량/예산·시간·기존 안전 매대 슬롯의 상품군 순서다. 새 색상 강조·음성·지도·벽·버튼을 제공됐다고 쓰지 않는다.");
        return root;
    }

    /** Review text is bounded data. Only source pointers present in this input can support a repair. */
    public static Map<String, Object> validate(ObjectMapper mapper, JsonNode review, ObjectNode input) {
        String raw = mapper.writeValueAsString(review);
        var base = new LinkedHashMap<String, Object>();
        base.put("code", "AI_QUEST_CONSISTENCY_REVIEW_INVALID");
        base.put("reviewOutput", raw);
        base.put("candidateFacts", mapper.convertValue(input.path("candidateFacts"), Map.class));
        if (raw.length() > 12000 || !review.isObject()
                || !Set.of("VALID", "REPAIR").contains(review.path("verdict").asString())
                || !review.path("objectiveQuantityTotal").isIntegralNumber()
                || !review.path("objectiveCostTotal").isIntegralNumber()
                || !review.path("objectiveQuantityTotal").equals(input.path("candidateFacts").path("objectiveQuantityTotal"))
                || !review.path("objectiveCostTotal").equals(input.path("candidateFacts").path("objectiveCostTotal")))
            throw invalid(base);
        var dimensions = review.path("checkedDimensions");
        Set<String> checked = new HashSet<>();
        for (var dimension : dimensions) if (dimension.isString()) checked.add(dimension.asString());
        if (!dimensions.isArray() || dimensions.size() != DIMENSIONS.size() || !checked.equals(Set.copyOf(DIMENSIONS))) throw invalid(base);
        var plan = review.path("adaptationPlan");
        if (!plan.isObject() || !boundedText(plan.path("observationPurpose"), 240)
                || !plan.path("deliveredChanges").isArray() || plan.path("deliveredChanges").size() > 7) throw invalid(base);
        for (var change : plan.path("deliveredChanges"))
            if (!boundedText(change, 240)) throw invalid(base);
        validateBudgetClaim(mapper, review.path("budgetClaim"), input, base);
        validateShelfClaims(mapper, review, input, base);
        validateObservationPlan(mapper, review.path("observationPlan"), input, base);
        validateConditionAndEffectClaims(mapper, review, input, base);
        var issues = review.path("issues");
        if (!issues.isArray() || issues.size() > 8) throw invalid(base);
        for (var issue : issues) {
            if (!ISSUE_CODES.contains(issue.path("code").asString()) || !boundedText(issue.path("explanation"), 240)
                    || !issue.path("path").isString() || input.path("deliveredQuest").at(issue.path("path").asString()).isMissingNode()
                    || !issue.path("sourcePaths").isArray() || issue.path("sourcePaths").isEmpty() || issue.path("sourcePaths").size() > 4)
                throw invalid(base);
            for (var path : issue.path("sourcePaths"))
                if (!path.isString() || !path.asString().startsWith("/") || input.at(path.asString()).isMissingNode()) throw invalid(base);
        }
        if (("VALID".equals(review.path("verdict").asString())) != issues.isEmpty()) throw invalid(base);
        base.put("code", issues.isEmpty() ? "AI_QUEST_CONSISTENCY_REVIEWED" : "AI_QUEST_CONSISTENCY_MISMATCH");
        base.put("adaptationPlan", mapper.convertValue(plan, Map.class));
        if (!issues.isEmpty()) {
            base.put("issues", mapper.convertValue(issues, List.class));
            throw new MarketQuestValidationException("과제와 조정 설명 불일치", base);
        }
        return Map.copyOf(base);
    }

    /** Last supplied task in recorded play order, including unknown baseline fields rather than older convenient values. */
    static ObjectNode observationComparisonSource(ObjectMapper mapper, ObjectNode input) {
        var result = mapper.createObjectNode();
        var history = input.path("practiceHistoryFacts");
        for (int play = history.size() - 1; play >= 0; play--) {
            var tasks = history.get(play).path("recordedTasks");
            if (tasks.isEmpty()) continue;
            int task = tasks.size() - 1;
            result.put("sourcePath", "/practiceHistoryFacts/" + play + "/recordedTasks/" + task);
            result.set("recordedTask", tasks.get(task).deepCopy());
            result.put("scope", "제공된 이력 순서의 최근 실제 목표와 안내다. 누락 난도/지원은 UNKNOWN이며 과거 AI 단계 라벨로 채우지 않는다. 동일 구매 조건의 성공은 다른 상품·규격의 전이나 학습 효과를 입증하지 않는다.");
            return result;
        }
        result.putNull("sourcePath"); result.putNull("recordedTask");
        result.put("scope", "비교할 실제 이전 목표가 없다. 이전보다 쉬움·지원 감소·전이를 확정하지 않는다.");
        return result;
    }

    private static void validateObservationPlan(ObjectMapper mapper, JsonNode plan, ObjectNode input, LinkedHashMap<String, Object> base) {
        var comparison = input.path("observationComparisonSource");
        if (!plan.isObject() || !plan.propertyNames().equals(Set.of("purpose", "comparisonSourcePath", "changedDimensions", "untestedQuestion", "learningClaim"))
                || !Set.of("GUIDED_PRACTICE", "REPEAT_OBSERVATION", "SUPPORT_FADING", "TRANSFER_PROBE").contains(plan.path("purpose").asString())
                || !plan.path("comparisonSourcePath").equals(comparison.path("sourcePath"))
                || !boundedText(plan.path("untestedQuestion"), 240)
                || !"NOT_ESTABLISHED".equals(plan.path("learningClaim").asString())
                || !plan.path("changedDimensions").isArray() || plan.path("changedDimensions").size() > 6) throw invalid(base);
        var literal = comparison.path("recordedTask").path("literalComparisonToCandidate");
        Map<String, String> fields = Map.of("OBJECTIVES", "sameObjectivesAndQuantities", "BUDGET", "sameBudget", "TIME", "sameTimeLimit",
                "SUPPORT", "sameInstructionTextIgnoringWhitespaceAndSentenceSplits", "DIFFICULTY", "sameDifficulty");
        Set<String> dimensions = new HashSet<>();
        for (var dimension : plan.path("changedDimensions")) {
            String name = dimension.asString();
            if (!dimension.isString() || !dimensions.add(name) || !(fields.containsKey(name) || name.equals("SHELVES"))) throw invalid(base);
            if (fields.containsKey(name) && (!literal.path(fields.get(name)).isBoolean() || literal.path(fields.get(name)).asBoolean())) throw invalid(base);
            if (name.equals("SHELVES") && (!input.path("candidateFacts").path("sameCategoryOrderAsCurrentEnvironment").isBoolean()
                    || input.path("candidateFacts").path("sameCategoryOrderAsCurrentEnvironment").asBoolean())) throw invalid(base);
        }
        for (String name : List.of("OBJECTIVES", "BUDGET", "TIME", "DIFFICULTY"))
            if (literal.path(fields.get(name)).isBoolean() && !literal.path(fields.get(name)).asBoolean() && !dimensions.contains(name)) throw invalid(base);
        String purpose = plan.path("purpose").asString();
        if (purpose.equals("REPEAT_OBSERVATION") && (!literal.path("sameObjectivesAndQuantities").asBoolean() || !dimensions.isEmpty())) {
            base.put("code", "AI_QUEST_CONSISTENCY_MISMATCH");
            base.put("issues", List.of(Map.of("code", "UNEXPLAINED_REPEAT", "path", "/adaptationSummary",
                    "explanation", "REPEAT_OBSERVATION은 같은 구매 조건의 재현 관찰이다. 실제 목표/예산/시간 등이 달라졌으면 같은 조건이라고 쓰지 말고 목적과 변경 설명을 일치시켜야 합니다.",
                    "sourcePaths", List.of("/observationComparisonSource", "/candidateFacts"))));
            throw new MarketQuestValidationException("반복 목적과 실제 조건 변경 불일치", base);
        }
        if (purpose.equals("TRANSFER_PROBE") && (!literal.path("sameProductIds").isBoolean() || literal.path("sameProductIds").asBoolean())) throw invalid(base);
        if (purpose.equals("SUPPORT_FADING") && (!literal.path("sameObjectivesAndQuantities").asBoolean()
                || !dimensions.equals(Set.of("SUPPORT")))) throw invalid(base);
        base.put("observationPlan", mapper.convertValue(plan, Map.class));
    }

    /** AI interprets the quoted prose; server checks its declared relation against literal provided values. */
    private static void validateConditionAndEffectClaims(ObjectMapper mapper, JsonNode review, ObjectNode input, LinkedHashMap<String, Object> base) {
        var claim = review.path("conditionClaim"); var effects = review.path("effectClaim");
        var quote = input.path("deliveredQuest").path("adaptationSummary");
        if (!claim.isObject() || !claim.path("quote").equals(quote)
                || !Set.of("SAME", "CHANGED", "UNKNOWN", "UNSPECIFIED").contains(claim.path("relation").asString())
                || !claim.path("dimensions").isArray() || claim.path("dimensions").size() > 7
                || !effects.isObject() || !effects.path("quote").equals(quote)
                || !Set.of("EXCLUDED", "REDUCED", "INTENDED_REDUCTION", "UNSPECIFIED").contains(effects.path("movement").asString())
                || !Set.of("ESTABLISHED", "NOT_ESTABLISHED", "UNSPECIFIED").contains(effects.path("learning").asString())) throw invalid(base);
        Map<String,String> fields = Map.of("PRODUCTS", "sameProductIds", "OBJECTIVES", "sameObjectivesAndQuantities", "BUDGET", "sameBudget",
                "TIME", "sameTimeLimit", "DIFFICULTY", "sameDifficulty", "SUPPORT", "sameInstructionTextIgnoringWhitespaceAndSentenceSplits");
        var literal = input.path("observationComparisonSource").path("recordedTask").path("literalComparisonToCandidate");
        String relation = claim.path("relation").asString(); boolean changed = false, unknown = false;
        Set<String> dimensions = new HashSet<>();
        var changedDimensions = new java.util.ArrayList<String>();
        var unknownDimensions = new java.util.ArrayList<String>();
        var literalSameByDimension = new LinkedHashMap<String, Object>();
        for (var dimension : claim.path("dimensions")) {
            String key = dimension.asString();
            if (!dimension.isString() || !dimensions.add(key) || !(fields.containsKey(key) || key.equals("SHELVES"))) throw invalid(base);
            var value = key.equals("SHELVES") ? input.path("candidateFacts").path("sameCategoryOrderAsCurrentEnvironment") : literal.path(fields.get(key));
            unknown |= !value.isBoolean(); changed |= value.isBoolean() && !value.asBoolean();
            literalSameByDimension.put(key, value.isBoolean() ? value.asBoolean() : "UNKNOWN");
            if (!value.isBoolean()) unknownDimensions.add(key);
            else if (!value.asBoolean()) changedDimensions.add(key);
        }
        if ((relation.equals("UNSPECIFIED") && !dimensions.isEmpty()) || (!relation.equals("UNSPECIFIED") && dimensions.isEmpty())) throw invalid(base);
        boolean mismatch = relation.equals("SAME") && (changed || unknown) || relation.equals("CHANGED") && !changed || relation.equals("UNKNOWN") && !unknown;
        boolean unsupportedEffect = Set.of("EXCLUDED", "REDUCED").contains(effects.path("movement").asString()) || effects.path("learning").asString().equals("ESTABLISHED");
        if (mismatch || unsupportedEffect) {
            base.put("code", "AI_QUEST_CONSISTENCY_MISMATCH");
            base.put("conditionComparison", Map.of("claimedRelation", relation,
                    "literalSameByDimension", literalSameByDimension,
                    "changedDimensions", changedDimensions, "unknownDimensions", unknownDimensions));
            base.put("conditionClaim", mapper.convertValue(claim, Map.class)); base.put("effectClaim", mapper.convertValue(effects, Map.class));
            base.put("issues", List.of(Map.of("code", unsupportedEffect ? "UNSUPPORTED_HISTORY_CLAIM" : "PLAN_IMPLEMENTATION_MISMATCH",
                    "path", "/adaptationSummary", "explanation", unsupportedEffect
                            ? "아직 실행하지 않은 추천의 이동 부담 배제/감소나 학습 효과를 확인된 결과로 쓰지 않습니다. 의도와 다음 관찰 질문만 설명해야 합니다."
                            : "AI가 인용 문장을 " + relation + " 조건으로 해석했지만 변경된 차원=" + changedDimensions
                                    + ", 미기록 차원=" + unknownDimensions + "입니다. 미기록 차원은 유지/감소/동일하다고 설명하지 않고 이번 제공 조건만 설명합니다.",
                    "sourcePaths", List.of("/observationComparisonSource", "/candidateFacts"))));
            throw new MarketQuestValidationException("조건 설명 또는 미관측 효과 주장 불일치", base);
        }
        base.put("conditionClaim", mapper.convertValue(claim, Map.class)); base.put("effectClaim", mapper.convertValue(effects, Map.class));
    }

    /** Latest supplied known mission budget, using the preserved history/task order rather than AI prose. */
    private static ObjectNode budgetComparisonSource(ObjectMapper mapper, ObjectNode input) {
        var source = mapper.createObjectNode();
        var history = input.path("practiceHistoryFacts");
        for (int play = history.size() - 1; play >= 0; play--) {
            var tasks = history.get(play).path("recordedTasks");
            for (int task = tasks.size() - 1; task >= 0; task--) {
                var value = tasks.get(task).path("mission").path("budget");
                if (!value.isIntegralNumber() || !value.canConvertToInt()) continue;
                source.put("sourcePath", "/practiceHistoryFacts/" + play + "/recordedTasks/" + task + "/mission/budget");
                source.set("sourceBudget", value.deepCopy());
                source.put("scope", "제공된 실제 이력 순서에서 마지막으로 예산이 기록된 미션이다. 원본의 orderingScope를 함께 읽으며 완전한 평생 이력이나 미기록 시간순서를 확정하지 않는다.");
                return source;
            }
        }
        source.putNull("sourcePath"); source.putNull("sourceBudget");
        source.put("scope", "제공된 원본 이력에 비교할 정수 예산이 없다. 과거 예산을 같음·증가·감소로 채우지 않는다.");
        return source;
    }

    /** Verify literal quote/source pairs and arithmetic only; the AI still interprets the quoted meaning. */
    private static void validateBudgetClaim(ObjectMapper mapper, JsonNode claim, ObjectNode input,
            LinkedHashMap<String, Object> base) {
        var summary = input.path("deliveredQuest").path("adaptationSummary");
        if (!claim.isObject() || !boundedText(claim.path("quote"), 240) || !claim.path("quote").equals(summary)
                || !BUDGET_RELATIONS.contains(claim.path("relation").asString())
                || !claim.has("sourcePath") || !claim.has("sourceBudget")
                || !claim.path("proposedBudget").isIntegralNumber() || !claim.path("proposedBudget").canConvertToInt()
                || !claim.path("proposedBudget").equals(input.path("candidateFacts").path("budget")))
            throw invalid(base);
        var expected = budgetComparisonSource(mapper, input);
        String relation = claim.path("relation").asString();
        if (expected.path("sourcePath").isNull()) {
            if (!claim.path("sourcePath").isNull() || !claim.path("sourceBudget").isNull()
                    || !("UNKNOWN".equals(relation) || "UNSPECIFIED".equals(relation))) throw invalid(base);
        } else {
            if (!claim.path("sourcePath").isString() || !claim.path("sourcePath").equals(expected.path("sourcePath"))
                    || !claim.path("sourceBudget").isIntegralNumber() || !claim.path("sourceBudget").canConvertToInt()
                    || !claim.path("sourceBudget").equals(expected.path("sourceBudget")) || "UNKNOWN".equals(relation))
                throw invalid(base);
            int before = claim.path("sourceBudget").asInt(), after = claim.path("proposedBudget").asInt();
            boolean contradicted = switch (relation) {
                case "UNCHANGED" -> before != after;
                case "INCREASED" -> after <= before;
                case "DECREASED" -> after >= before;
                default -> false;
            };
            if (contradicted) {
                base.put("code", "AI_QUEST_CONSISTENCY_MISMATCH");
                base.put("budgetClaim", mapper.convertValue(claim, Map.class));
                base.put("budgetComparisonSource", mapper.convertValue(expected, Map.class));
                base.put("issues", List.of(Map.of("code", "BUDGET_CLAIM_MISMATCH", "path", "/adaptationSummary",
                        "explanation", "AI가 인용 문장의 예산 관계를 " + relation + "로 해석했지만 원본 예산 " + before + "과 제안 예산 " + after + "의 수치 관계가 다릅니다.",
                        "sourcePaths", List.of(expected.path("sourcePath").asString(), "/candidateFacts/budget"))));
                throw new MarketQuestValidationException("인용 예산 관계와 실제 수치 불일치", base);
            }
        }
        base.put("budgetClaim", mapper.convertValue(claim, Map.class));
    }

    /** The AI interprets position prose; the server compares its literal claim to the supplied assignment. */
    private static void validateShelfClaims(ObjectMapper mapper, JsonNode review, ObjectNode input,
            LinkedHashMap<String, Object> base) {
        var claims = review.path("shelfClaims");
        if (!claims.isArray() || claims.size() > 8) throw invalid(base);
        var assignments = input.path("candidateFacts").path("plannedSlotAssignments");
        int claimIndex = 0;
        for (var claim : claims) {
            String path = claim.path("textPath").asString();
            boolean questText = Set.of("/deliveredQuest/title", "/deliveredQuest/description",
                    "/deliveredQuest/adaptationSummary", "/deliveredQuest/environmentPlan/rationale").contains(path)
                    || path.matches("/deliveredQuest/(briefing|checkoutDialogue)/[0-9]+");
            boolean reviewText = path.equals("/adaptationPlan/observationPurpose")
                    || path.matches("/adaptationPlan/deliveredChanges/[0-9]+");
            var quoted = questText ? input.at(path) : reviewText ? review.at(path) : mapper.missingNode();
            if (!claim.isObject() || !boundedText(claim.path("quote"), 240) || !quoted.isString()
                    || !quoted.asString().contains(claim.path("quote").asString())
                    || !claim.path("categoryId").isString() || !claim.path("claimedSlotId").isString()) {
                base.put("path", "/shelfClaims/" + claimIndex + "/quote");
                base.put("quoteMatchRule", "textPath가 가리키는 원문에 그대로 존재하는 연속된 위치 주장 인용이어야 합니다. 원문을 바꾸거나 만들어 쓰지 않습니다.");
                throw invalid(base);
            }
            JsonNode actual = null;
            int assignmentIndex = 0, actualIndex = -1;
            Set<String> slotIds = new HashSet<>();
            for (var assignment : assignments) {
                slotIds.add(assignment.path("slotId").asString());
                if (assignment.path("categoryId").equals(claim.path("categoryId"))) {
                    actual = assignment;
                    actualIndex = assignmentIndex;
                }
                assignmentIndex++;
            }
            if (actual == null || !slotIds.contains(claim.path("claimedSlotId").asString())) {
                base.put("path", "/shelfClaims/" + claimIndex);
                throw invalid(base);
            }
            if (!actual.path("slotId").equals(claim.path("claimedSlotId"))) {
                base.put("code", "AI_QUEST_CONSISTENCY_MISMATCH");
                base.put("shelfClaim", mapper.convertValue(claim, Map.class));
                base.put("actualPlannedAssignment", mapper.convertValue(actual, Map.class));
                base.put("issues", List.of(Map.of("code", "SHELF_CLAIM_MISMATCH", "path",
                        questText ? path.substring("/deliveredQuest".length()) : "/adaptationSummary",
                        "explanation", "AI가 인용한 배치 설명을 " + claim.path("categoryId").asString() + "→"
                                + claim.path("claimedSlotId").asString() + "로 해석했지만 실제 요청 배정은 "
                                + actual.path("slotId").asString() + "입니다. 검토자의 변경 설명도 원본과 대조하세요.",
                        "sourcePaths", List.of("/candidateFacts/plannedSlotAssignments/" + actualIndex + "/slotId"))));
                throw new MarketQuestValidationException("인용 배치 설명과 실제 요청 슬롯 불일치", base);
            }
            claimIndex++;
        }
        base.put("shelfClaims", mapper.convertValue(claims, List.class));
    }

    private static MarketQuestValidationException invalid(Map<String, Object> details) {
        return new MarketQuestValidationException("AI 과제 일치 검토 형식 또는 검산 오류", details);
    }

    private static boolean boundedText(JsonNode text, int limit) {
        return text.isString() && !text.asString().isBlank() && text.asString().length() <= limit;
    }

    private static Integer quantityTotal(JsonNode objectives) {
        var values = objectiveMap(objectives);
        return values == null ? null : values.values().stream().mapToInt(Integer::intValue).sum();
    }

    private static Map<String, Integer> objectiveMap(JsonNode objectives) {
        if (!objectives.isArray() || objectives.isEmpty()) return null;
        Map<String, Integer> result = new LinkedHashMap<>();
        for (var objective : objectives) {
            var id = objective.path("productId"); var quantity = objective.path("quantity");
            if (!id.isString() || !quantity.isIntegralNumber() || !quantity.canConvertToInt() || quantity.asInt() < 0
                    || result.put(id.asString(), quantity.asInt()) != null) return null;
        }
        return result;
    }

    private static String instructionText(JsonNode mission) {
        var briefing = mission.path("briefing"); var checkout = mission.path("checkoutDialogue");
        if (!briefing.isArray() || !checkout.isArray()) return null;
        var text = new StringBuilder();
        for (var values : List.of(briefing, checkout)) for (var value : values) {
            if (!value.isString()) return null;
            text.append(value.asString().replaceAll("[\\s\\p{Punct}。！？]", ""));
        }
        return text.toString();
    }

    private static void copy(JsonNode source, String field, ObjectNode target) {
        if (source.has(field)) target.set(field, source.get(field).deepCopy());
    }
}
