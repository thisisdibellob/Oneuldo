package oneuldo.behaviorlog.personalization.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The model chooses how much room the budget leaves; the catalog arithmetic is done here.
 * budget = unit price x quantity for every goal + the chosen headroom. Goals, quantities and the headroom
 * stay the model's decisions, and the ordinary budget range and extra-drink checks still run on the result.
 */
final class AdaptiveQuestBudget {
    static final String FIELD="budgetHeadroom";
    static final int MAXIMUM=4000;
    static final String TEMPLATE="int 0.."+MAXIMUM+": won above the exact catalog cost of the goals (0=exact); the server computes budget";
    static final String RULE=" Do not calculate totals. Return budgetHeadroom, an integer 0.."+MAXIMUM+" in won above the exact catalog cost of the chosen goals (0 means exact); the server computes budget = unit price times quantity for every goal + budgetHeadroom and writes it into the quest. With budgetChoiceEnabled=true the headroom must cover one extra drink. Historical goal amounts are not current catalog prices. Do not write a total or budget amount in won in any text; for /budget in changeReasons explain only why the headroom is tight or generous.";
    /** The headroom in force for this generation and the budget last written from it. */
    private Integer headroom,written;
    Integer headroom() {return headroom;}

    /** Exact catalog cost of the goals, or null while a goal is not yet a valid catalog product and quantity. */
    static Integer cost(JsonNode objectives) {
        if(!objectives.isArray()||objectives.isEmpty())return null;
        long total=0;
        for(var objective:objectives) {
            var id=objective.path("productId");var quantity=objective.path("quantity");
            if(!id.isString()||!quantity.isIntegralNumber()||!quantity.canConvertToInt()||quantity.asInt()<1||quantity.asInt()>3)return null;
            var product=MarketQuestCatalog.PRODUCTS.stream().filter(p->p.id().equals(id.asString())).findFirst();
            if(product.isEmpty())return null;
            total+=(long)product.get().price()*quantity.asInt();
        }
        return (int)total;
    }

    /** Unit price of the cheapest extra drink the quest's own settings allow, or null when the choice is off or malformed. */
    static Integer cheapestExtraDrink(JsonNode quest) {
        var runtime=quest.path("runtimePlan");var learning=runtime.path("learning");
        if(!learning.path("budgetChoiceEnabled").asBoolean(false)||!learning.path("choiceBudget").isIntegralNumber())return null;
        int stock=runtime.path("stockPerProduct").asInt(0);Integer best=null;
        for(var product:MarketQuestCatalog.PRODUCTS) {
            if(!product.categoryId().equals("drink")||product.price()>learning.path("choiceBudget").asInt())continue;
            boolean goal=false;for(var objective:quest.path("objectives"))goal|=product.id().equals(objective.path("productId").asString());
            var override=runtime.path("stockOverrides").path(product.id());
            if(goal||(override.isIntegralNumber()?override.asInt():stock)<=0)continue;
            if(best==null||product.price()<best)best=product.price();
        }
        return best;
    }
    /**
     * Writes the computed budget. A later repair that changes the goals keeps the same headroom;
     * a repair that itself sets a different budget which is a valid headroom for the goals replaces the choice.
     */
    void apply(JsonNode candidate) {
        if(!(candidate instanceof ObjectNode quest))return;
        Integer cost=cost(quest.path("objectives"));Integer chosen=null;
        if(quest.has(FIELD)) {
            var value=quest.get(FIELD);
            if(!value.isIntegralNumber()||!value.canConvertToInt()||value.asInt()<0||value.asInt()>MAXIMUM)
                throw AdaptiveQuestContract.problem("/"+FIELD,"INTEGER_RANGE:0.."+MAXIMUM);
            chosen=value.asInt();
        } else if(headroom!=null) {
            chosen=headroom;
            var budget=quest.path("budget");
            if(cost!=null&&budget.isIntegralNumber()&&(written==null||budget.asLong()!=written)) {
                long implied=budget.asLong()-cost;
                if(implied>=0&&implied<=MAXIMUM)chosen=(int)implied;
            }
        }
        // No headroom in this answer and none chosen before: a plain budget is validated exactly as it was.
        if(chosen==null)return;
        // The model explains its choice under the name it was asked for; in the quest that value lives at /budget.
        for(var reason:quest.path("observationPlan").path("changeReasons"))
            if(reason instanceof ObjectNode row&&("/"+FIELD).equals(row.path("path").asString()))row.put("path","/budget");
        // Enabling the extra drink and leaving no room for the cheapest one contradict each other; the room is arithmetic.
        Integer drink=cheapestExtraDrink(quest);
        if(drink!=null&&chosen<drink&&drink<=MAXIMUM)chosen=drink;
        quest.remove(FIELD);headroom=chosen;
        if(cost!=null)quest.put("budget",cost+chosen);
        else if(!quest.path("budget").isIntegralNumber())quest.put("budget",chosen);
        written=quest.path("budget").asInt();
    }
}
