package oneuldo.behaviorlog.analysis.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Recorded navigation context only. No wandering threshold, path score or ability inference. */
public final class MovementSourceContext {
    public static final String FIELD = "sourceMovementContext";
    public static final String HISTORY_SCOPE = "practiceHistory의 sourceMovementContext는 각 실제 플레이의 매장 종류·다섯 실제 매대 자리·출발점·지원·수집/입력 조건만 선택한 배치 비교 원본이다. "
            + "목표는 recordedPractice.tasks를 참조한다. 상품 선택 화면의 60 SKU 행과 과거 좌표·이동 사건·벽·장애물·NPC 초기/동적 상태 상세는 이 이력에 반복 제공하지 않는다. "
            + "상세 원본은 각 플레이의 분석 스냅샷에 보존하고 현재 세션 분석은 원본 타임라인을 읽는다. 기존 AI 이동 해석은 재검토할 간접 보고다. "
            + "이 배치 맥락만으로 과거 최적 경로·필수 우회·헤맴 원인·능력 변화를 확정하지 않는다. 과거 상세가 없다는 한계를 유지한다. 새 근거 인용 권한이나 성패 판정은 없다.";
    public static final String LEGACY_RULE = "이동 샘플 수는 제공된 위치 기록 수이며 이동 횟수·충돌 횟수·헤맴 횟수가 아니다. "
            + "프레임/입력 콜백 빈도, controlMode, 수집 버전·movementContext의 samplingRule·movementSpan 축약, 기록 범위에 따라 수가 달라진다. "
            + "원본 sampleCount/observedDistance/pathDistance/straightDistance는 해당 수집 구간의 기술적 관측이다. 직선거리는 장애물을 통과하는 값일 수 있어 가능한 최단 동선으로 쓰지 않는다. "
            + "ROUTE_LOOP_DETECTED는 매대 근접 순서 A→B→A, WRONG_AISLE_ENTERED는 당시 남은 목표가 없는 매대 근접, TARGET_PASSED는 남은 목표 매대에 근접했다가 열지 않고 벗어난 자동 기록이다. "
            + "이 사건 이름은 길 잃음·오답·상품 인지·이해 실패 판정이 아니다. SHELF_OPENED/수량 변경/장바구니/제출을 함께 대조한다. "
            + "이동 어려움 가설은 좌표·실제 이동 구간·방문 순서와 현재 구매 목표, 해당 플레이의 매대 배치·통로·장애물·NPC·출발점·지원 조건을 함께 보고 AI가 판단한다. "
            + "다른 플레이와 비교할 때는 각각의 원본 배치·목표·지원·수집/입력 조건 차이를 확인한다. 긴 동선이나 왕복만으로 헤맴·능력 부족·실패를 확정하지 않는다. "
            + "mission.environmentPlan은 AI가 요청한 계획이다. environmentPlanApplication과 recordedGeometry의 실제 적용 배치를 대조하며 요청을 실행 사실로 바꾸지 않는다. "
            + "원본이 기록한 AGENT/persona/controlMode는 입력 출처 맥락이다. 테스트·리플레이·운영자의 방향키 개입 기록을 실제 학습자의 행동이나 능력으로 귀속하지 않는다. agent 표시만으로 모든 조작 주체가 같다고 보장하지 않는다. "
            + "막힘 기록은 발생한 막힘과 해제의 관측이며 원인이나 독립 충돌 수를 자동 확정하지 않는다. 당시 동적 NPC/계산원 상태나 경로 원본이 없으면 원인·필요 우회·헤맴 여부는 uncertainties에 남긴다. "
            + "sourceMovementContext의 범위는 stage·scopeVersion과 제공 필드에 따른다. 세션 분석 사본은 샘플 외 이동 사건을 제공하며 이력 배치 맥락은 이동 상세를 재제공하지 않는다. "
            + "모든 좌표 샘플을 다시 제공한 자료는 아니다. 없는 필드는 미기록이며 현재 맵이나 이전 AI 해석으로 채우지 않는다.";
    public static final String RULE = "Samples count supplied position records, not moves/collisions/wandering; frequency depends on frames/input/controlMode/collector samplingRule/movementSpan/coverage. "
            + "sampleCount/distances describe collector intervals; straightDistance may cross obstacles and is not a feasible shortest route. "
            + "ROUTE_LOOP_DETECTED=A→B→A shelf proximity; WRONG_AISLE_ENTERED=no remaining target at that shelf; TARGET_PASSED=approached remaining-target shelf then left unopened. These labels prove no disorientation/error/perception/comprehension. Compare shelf opening, quantity, cart and checkout. "
            + "AI evaluates movement hypotheses using original coordinates/segments/visit order and actual goals/layout/aisles/obstacles/NPCs/start/support/input; long paths or returns alone prove no deficit/failure. Compare each play's real conditions. "
            + "mission.environmentPlan is proposed; compare environmentPlanApplication/recordedGeometry before claiming delivery. AGENT/persona/controlMode identifies input context; do not attribute tests/replays/operator intervention to learner ability or assume one actor for all agent input. "
            + "Blocking/unblocking records observations, not causes or independent collision count. Missing dynamic NPC/cashier/path originals leaves cause/necessary detour/wandering uncertain. "
            + "Scope depends on stage/scopeVersion/fields: session context includes nonsample movement events; history layout omits movement detail. Not all coordinate samples are repeated. Missing means unrecorded; never fill from current maps or past AI claims.";
    private static final Set<String> EVENTS = Set.of("SHOP.ITEM_SEARCH_STARTED", "SHOP.MOVEMENT_SEGMENT_SUMMARIZED",
            "SHOP.MOVEMENT_STOPPED", "SHOP.MOVEMENT_BLOCKED", "SHOP.MOVEMENT_BLOCKED_REPEATEDLY", "SHOP.MOVEMENT_UNBLOCKED",
            "SHOP.OFF_TARGET_DWELL", "SHOP.ROUTE_LOOP_DETECTED", "SHOP.SHELF_PROXIMITY_ENTERED", "SHOP.SHELF_PROXIMITY_EXITED",
            "SHOP.SHELF_REVISITED", "SHOP.CHECKOUT_PROXIMITY_ENTERED", "SHOP.CHECKOUT_PROXIMITY_EXITED", "SHOP.TARGET_PASSED",
            "SHOP.TARGET_SHELF_APPROACHED", "SHOP.TARGET_SHELF_REVISITED", "SHOP.WRONG_AISLE_ENTERED", "SHOP.SHELF_OPENED", "SHOP.SHELF_CLOSED");
    private static final List<String> VALUES = List.of("controlMode", "x", "y", "blocked", "durationMs", "travelDistance",
            "pathDistance", "straightDistance", "stationId", "stationSequence", "visitIndex", "intervalSinceLastVisitMs",
            "isTargetZone", "shelfOpened", "hasRemainingTarget", "proximityDurationMs", "blockedCount", "observationWindowMs");
    private MovementSourceContext() {}

    public static ObjectNode build(ObjectMapper mapper, BehaviorAnalysisInputResponse input) {
        return build(mapper, input, true);
    }

    /** Full timelines already carry the map and event values; do not duplicate those large sources. */
    public static ObjectNode timelineContext(ObjectMapper mapper, BehaviorAnalysisInputResponse input) {
        var result = build(mapper, input, false);
        result.put("scope", "이 입력의 원본 좌표·배치·이동 사건 값은 behaviorTimeline에 제공한다. 아래는 출처와 수집 맥락만 보여 주며 원본 누락을 뜻하지 않는다.");
        return result;
    }

    private static ObjectNode build(ObjectMapper mapper, BehaviorAnalysisInputResponse input, boolean includeRawDetails) {
        var root = mapper.createObjectNode();
        var stations = RecordedStationIdentity.byEvent(mapper, input);
        root.put("rule", RULE);
        var sessions = root.putArray("sessions");
        for (var session : input.input().sessions()) {
            var row = sessions.addObject().put("sessionId", session.sessionId().toString());
            var scenes = row.putArray("sceneSources");
            var contexts = row.putArray("collectorContexts");
            var events = includeRawDetails ? row.putArray("movementEventDetails") : null;
            Set<JsonNode> seenContexts = new HashSet<>();
            long sampleCount = 0;
            for (var event : session.events()) {
                JsonNode source = mapper.valueToTree(event);
                var payload = source.path("payload");
                var content = payload.path("marketContent");
                var context = mapper.createObjectNode();
                for (String field : List.of("sceneRef", "layoutVersion", "seed", "movementContext", "controlSource", "agentContext", "replayExecutionContext"))
                    copy(content, field, context, field);
                copy(source, "accessibility", context, "accessibility");
                if (!context.isEmpty() && seenContexts.add(context.deepCopy())) {
                    context.put("sourceEventId", event.behaviorLogId().toString());
                    contexts.add(context);
                }
                var scene = content.path("sceneSnapshot");
                if (scene.isObject()) {
                    var recorded = scenes.addObject().put("sourceEventId", event.behaviorLogId().toString());
                    for (String field : List.of("questInstanceId", "layoutVersion", "seed"))
                        copy(scene, field, recorded, field);
                    if (includeRawDetails) {
                        for (String field : List.of("startingConditions", "environmentPlanApplication"))
                            copy(scene, field, recorded, field);
                        var geometry = scene.path("startingConditions").path("geometry");
                        JsonNode parsed = geometry;
                        if (geometry.isString()) {
                            try { parsed = mapper.readTree(geometry.asString()); }
                            catch (RuntimeException ignored) { /* Legacy descriptive geometry remains a source string. */ }
                        }
                        if (parsed != null && parsed.isObject()) {
                            recorded.put("geometrySource", "sceneSnapshot.startingConditions.geometry");
                            recorded.set("recordedGeometry", navigationGeometry(mapper, parsed));
                            // Keep the relevant original fields without repeating a large JSON string.
                            ((ObjectNode) recorded.path("startingConditions")).remove("geometry");
                        }
                    }
                }
                String code = source.path("action").path("eventCode").asString();
                if ("SHOP.MOVEMENT_SAMPLED".equals(code)) sampleCount++;
                if (!includeRawDetails || !EVENTS.contains(code)) continue;
                var detail = events.addObject().put("id", event.behaviorLogId().toString())
                        .put("sequence", event.sequence()).put("timeMs", event.elapsedFromSessionStartMs()).put("eventCode", code);
                for (String field : VALUES) copy(payload, field, detail, field);
                if (stations.containsKey(event.behaviorLogId().toString()))
                    detail.set("recordedStation", stations.get(event.behaviorLogId().toString()).deepCopy());
                copy(content, "blockedPhase", detail, "blockedPhase");
            }
            row.put("providedPositionSampleEventCount", sampleCount);
        }
        return root;
    }

    /** A history context does not grant fresh evidence references to the profile model. */
    public static ObjectNode forSession(ObjectMapper mapper, BehaviorAnalysisInputResponse input, UUID session) {
        for (var row : build(mapper, input).path("sessions")) if (session.toString().equals(row.path("sessionId").asString())) {
            var result = ((ObjectNode) row).deepCopy();
            result.remove(List.of("sessionId", "movementEventDetails"));
            for (String field : List.of("sceneSources", "collectorContexts", "movementEventDetails"))
                for (var event : result.path(field)) ((ObjectNode) event).remove(List.of("sourceEventId", "id"));
            for (var source : result.path("sceneSources")) {
                var scene = (ObjectNode) source;
                // Purchase goals already occur in recordedPractice.tasks; modal SKU rows are not walking slots.
                scene.remove(List.of("mission", "slots"));
                if (scene.path("recordedGeometry") instanceof ObjectNode geometry) {
                    var historyGeometry = mapper.createObjectNode();
                    for (String field : List.of("schemaVersion", "layoutVersion", "seed", "world", "spawn"))
                        copy(geometry, field, historyGeometry, field);
                    if (geometry.path("config").isObject()) {
                        var config = historyGeometry.putObject("config");
                        for (String field : List.of("layoutId", "shelfOrder")) copy(geometry.path("config"), field, config, field);
                    }
                    if (geometry.path("shelves").isObject()) {
                        var shelves = historyGeometry.putObject("shelves");
                        for (String category : ((ObjectNode)geometry.get("shelves")).propertyNames()) {
                            var placement = shelves.putObject(category);
                            for (String field : List.of("slotId", "orientation", "x", "y", "width", "height", "point"))
                                copy(geometry.path("shelves").path(category), field, placement, field);
                        }
                    }
                    scene.set("recordedGeometry", historyGeometry);
                }
            }
            result.put("scopeVersion", "navigation-layout-history-v1");
            return result;
        }
        return mapper.createObjectNode();
    }

    private static ObjectNode navigationGeometry(ObjectMapper mapper, JsonNode geometry) {
        var result = mapper.createObjectNode();
        for (String field : List.of("schemaVersion", "layoutVersion", "seed", "config", "world", "shelves",
                "walkableAreas", "obstacles", "spawn", "exit", "entrance", "commonDoor",
                "alarmGates", "constructionZones", "checkouts", "kiosks", "employees", "customers"))
            copy(geometry, field, result, field);
        result.put("scope", "초기 실제 매대·통행 범위·충돌 장애물·NPC/계산대 상태의 원본 선택값이다. "
                + "obstacles는 초기 충돌 영역 원문이다. 동일 영역을 반복하는 벽·장식물 목록과 별도 stationDetails는 재복사하지 않는다. "
                + "매대 발판/접근점은 shelves, 수집기의 모든 접근점은 collectorContexts.movementContext.stations를 참조한다. "
                + "상품 목표는 taskContext, 선택 화면의 SKU 표시는 sourceEventDetails/관측 원본을 참조한다. 원본 전체는 스냅샷과 관측 입력에 보존한다. 이후 동적 상태·실제 최단 경로는 이 초기 배치만으로 확인하지 않는다.");
        return result;
    }

    private static void copy(JsonNode source, String field, ObjectNode target, String name) {
        if (source.hasNonNull(field)) target.set(name, source.get(field).deepCopy());
    }
}
