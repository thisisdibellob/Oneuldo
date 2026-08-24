package oneuldo.simulationquest.dto.payload.shopping;

public record ShoppingProduct(
        String id,
        String categoryId,
        String name,
        String description,
        int price,
        String assetCode
) {
}
