package oneuldo.behaviorlog.personalization.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MarketQuestCatalog {

    public record Product(String id, String name, int price) {}

    public static final List<Product> PRODUCTS = List.of(
            new Product("milk", "흰 우유", 1800),
            new Product("apple", "사과", 1400),
            new Product("curry", "순한 카레", 2800),
            new Product("juice", "오렌지 주스", 3200)
    );
    private static final Map<String, Product> BY_ID = index();

    private MarketQuestCatalog() {}

    public static Product require(String id) {
        Product product = BY_ID.get(id);
        if (product == null) throw new IllegalArgumentException("허용되지 않은 상품입니다: " + id);
        return product;
    }

    private static Map<String, Product> index() {
        Map<String, Product> result = new LinkedHashMap<>();
        PRODUCTS.forEach(product -> result.put(product.id(), product));
        return Map.copyOf(result);
    }
}
