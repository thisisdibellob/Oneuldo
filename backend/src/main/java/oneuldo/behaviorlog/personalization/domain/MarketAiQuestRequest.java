package oneuldo.behaviorlog.personalization.domain;

import java.util.List;

/** Optional current-world source context; no coordinates are accepted in the AI output plan. */
public record MarketAiQuestRequest(EnvironmentContext environmentContext) {
    public record EnvironmentContext(String layoutId, List<ShelfSlot> shelfSlots, World world, Point spawn,
            Boolean preserveShelfOrder, tools.jackson.databind.JsonNode runtimeContext) {
        public EnvironmentContext {
            preserveShelfOrder = Boolean.TRUE.equals(preserveShelfOrder);
            if(runtimeContext!=null && runtimeContext.isNull())runtimeContext=null;
        }
        public EnvironmentContext(String layoutId, List<ShelfSlot> shelfSlots, World world, Point spawn, Boolean preserveShelfOrder) {
            this(layoutId, shelfSlots, world, spawn, preserveShelfOrder, null);
        }
        public EnvironmentContext(String layoutId, List<ShelfSlot> shelfSlots, World world, Point spawn) {
            this(layoutId, shelfSlots, world, spawn, false);
        }
    }
    /** x/y are the actual shelf footprint's top-left coordinates, in ordered runtime slots. */
    public record ShelfSlot(String slotId, String categoryId, Double x, Double y, String orientation) {}
    public record World(Double width, Double height) {}
    public record Point(Double x, Double y) {}
}
