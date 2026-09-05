package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 사용자 판정이 아닌 공통 게임 콘텐츠. 원본은 shared/market에 있다. */
public final class MarketQuestCatalog {
    public record Product(String id, String categoryId, String name, String detail, int price,
            String salesUnit, String storage, Map<String, Object> attributes, int initialStock) {}
    public record ScenarioObjective(String productId, String label, int quantity,
            Map<String, Object> match, List<String> acceptedProductIds) {}
    public record Scenario(String id, String title, int budget, List<ScenarioObjective> objectives,
            List<String> mandatoryProductIds, List<String> distractorProductIds, List<String> supportedOptions) {}

    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final JsonNode CATALOG = read("catalog.json");
    private static final JsonNode RUNTIME = read("runtime.json");
    private static final JsonNode QUESTS = read("quests.json");
    public static final String VERSION = CATALOG.path("content_version").asString();
    public static final String SCENARIO_VERSION = RUNTIME.path("version").asString();
    public static final int INITIAL_STOCK = RUNTIME.path("initialStockPerSku").asInt();
    public static final List<Product> PRODUCTS = products();
    private static final Map<String, Product> BY_ID = index();
    public static final List<Scenario> ENABLED_SCENARIOS = scenarios();

    private MarketQuestCatalog() {}
    public static Product require(String id) {
        Product product = BY_ID.get(id);
        if (product == null) throw new IllegalArgumentException("허용되지 않은 상품 ID");
        return product;
    }
    public static Scenario requireScenario(String id) {
        return ENABLED_SCENARIOS.stream().filter(s -> s.id().equals(id)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("아직 실행할 수 없는 시나리오"));
    }
    public static Map<String, Object> contentContext() {
        return Map.of("catalogVersion", VERSION, "scenarioVersion", SCENARIO_VERSION,
                "products", PRODUCTS, "enabledScenarios", ENABLED_SCENARIOS,
                "disclaimer", CATALOG.path("disclaimer_ko").asString(),
                "quantitySemantics", CATALOG.path("quantity_semantics_ko").asString(),
                "stockNote", RUNTIME.path("stockNote").asString());
    }
    private static JsonNode read(String name) {
        try (var stream = MarketQuestCatalog.class.getResourceAsStream("/market/" + name)) {
            if (stream == null) throw new IllegalStateException("장보기 공통 콘텐츠 누락: " + name);
            return MAPPER.readTree(stream);
        } catch (java.io.IOException exception) { throw new IllegalStateException("콘텐츠 읽기 실패", exception); }
    }
    private static List<Product> products() {
        if (!VERSION.equals(RUNTIME.path("catalogVersion").asString())) throw new IllegalStateException("카탈로그 버전 불일치");
        List<Product> result = new ArrayList<>();
        for (var p : CATALOG.path("products")) result.add(new Product(p.path("id").asString(), p.path("category_id").asString(),
                p.path("name").asString(), p.path("detail").asString(), p.path("price_won").asInt(),
                p.path("sales_unit").asString(), p.path("storage").asString(), attributes(p.path("attributes")), INITIAL_STOCK));
        if (result.size() != CATALOG.path("product_count").asInt()) throw new IllegalStateException("상품 개수 불일치");
        return List.copyOf(result);
    }
    private static Map<String, Product> index() {
        Map<String, Product> result = new LinkedHashMap<>();
        for (var p : PRODUCTS) {
            if (p.price() <= 0 || result.put(p.id(), p) != null) throw new IllegalStateException("잘못된 상품 데이터");
        }
        return Map.copyOf(result);
    }
    private static List<Scenario> scenarios() {
        Set<String> enabled = new HashSet<>(strings(RUNTIME.path("enabledScenarioIds")));
        List<Scenario> result = new ArrayList<>();
        for (var s : QUESTS.path("quests")) {
            if (!enabled.contains(s.path("id").asString())) continue;
            List<ScenarioObjective> objectives = new ArrayList<>();
            for (var o : s.path("objectives")) {
                Map<String, Object> match = attributes(o.path("match"));
                List<String> accepted = PRODUCTS.stream().filter(p -> match.entrySet().stream()
                        .allMatch(e -> Objects.equals(p.attributes().get(e.getKey()), e.getValue()))).map(Product::id).toList();
                String id = o.path("id").asString();
                if (!accepted.contains(id)) throw new IllegalStateException("시나리오 기준 상품이 조건을 만족하지 않음");
                objectives.add(new ScenarioObjective(id, o.path("label").asString(), o.path("quantity").asInt(), match, accepted));
            }
            result.add(new Scenario(s.path("id").asString(), s.path("title").asString(), s.path("budget_won").asInt(),
                    List.copyOf(objectives), strings(s.path("mandatory_skus")), strings(s.path("distractor_skus")),
                    strings(RUNTIME.path("implementedSupportOptions"))));
        }
        if (result.size() != enabled.size()) throw new IllegalStateException("활성 시나리오 누락");
        return List.copyOf(result);
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> attributes(JsonNode node) {
        return Map.copyOf(MAPPER.convertValue(node, Map.class));
    }
    private static List<String> strings(JsonNode node) {
        List<String> result = new ArrayList<>();
        node.forEach(value -> result.add(value.asString()));
        return List.copyOf(result);
    }
}
