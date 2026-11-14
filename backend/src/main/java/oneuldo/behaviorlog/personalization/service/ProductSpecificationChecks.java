package oneuldo.behaviorlog.personalization.service;

import java.math.BigDecimal;
import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/** Literal SKU/volume contradictions, never a cause or an ability judgment. */
public final class ProductSpecificationChecks {
    private ProductSpecificationChecks() {}
    public record Conflict(String path,String productId,String quote,String expectedDetail) {}
    private static final Pattern VOLUME=Pattern.compile("^[^0-9,，;；。\\n]{0,16}([0-9]+(?:\\.[0-9]+)?)(mL|ml|ML|L|l)");
    private static final Map<String,List<MarketQuestCatalog.Product>> NAMES=names();
    private static final Pattern PRODUCT=Pattern.compile(NAMES.keySet().stream()
        .sorted(Comparator.comparingInt(String::length).reversed()).map(Pattern::quote).collect(java.util.stream.Collectors.joining("|")));
    private static Map<String,List<MarketQuestCatalog.Product>> names() {
        var result=new LinkedHashMap<String,List<MarketQuestCatalog.Product>>();
        for(var p:MarketQuestCatalog.PRODUCTS)for(String label:List.of(p.name(),p.id()))
            result.computeIfAbsent(label.replaceAll("\\s+",""),x->new ArrayList<>()).add(p);
        return result;
    }
    public static List<Conflict> inspectMission(JsonNode mission) {
        var selected=new HashSet<String>();for(var o:mission.path("objectives"))selected.add(o.path("productId").asString());
        var out=new ArrayList<Conflict>();
        for(String field:List.of("title","description","briefing","checkoutDialogue","successMessage"))
            text(mission.path(field),"/"+field,selected,out);
        return List.copyOf(out);
    }
    private static void text(JsonNode value,String path,Set<String> selected,List<Conflict> out) {
        if(value.isArray()){for(int i=0;i<value.size();i++)text(value.get(i),path+"/"+i,selected,out);return;}
        if(!value.isString())return;
        String compact=value.asString().replaceAll("\\s+","");var product=PRODUCT.matcher(compact);
        while(product.find()) {
            // A longer catalog name wins (작은 흰 우유 must not be read as 흰 우유).
            var products=NAMES.get(product.group()).stream().filter(p->selected.contains(p.id())).toList();
            if(products.size()!=1)continue;
            var p=products.getFirst();Object amount=p.attributes().get("volume_ml");if(!(amount instanceof Number))continue;
            String tail=compact.substring(product.end());
            if(tail.matches("^(?:와|과|및|하고|랑).*$"))continue;
            var volume=VOLUME.matcher(tail);if(!volume.find())continue;
            String after=tail.substring(volume.end());
            if(after.matches("^(?:가|이|는|은)?(?:아닌|아니라|말고).*$"))continue;
            var actual=new BigDecimal(volume.group(1));if(volume.group(2).equalsIgnoreCase("l"))actual=actual.multiply(BigDecimal.valueOf(1000));
            if(actual.compareTo(new BigDecimal(amount.toString()))!=0)out.add(new Conflict(path,p.id(),value.asString(),p.detail()));
        }
    }
    /** Only identify historical tasks whose recorded content version matches this catalog. */
    public static List<Conflict> recordedConflicts(JsonNode original) {
        var result=new LinkedHashMap<String,Conflict>();recorded(original,"",result);return List.copyOf(result.values());
    }
    private static void recorded(JsonNode node,String path,Map<String,Conflict> out) {
        if(node.isObject()) {
            if(node.path("objectives").isArray()&&MarketQuestCatalog.VERSION.equals(node.path("catalogVersion").asString()))
                for(var issue:inspectMission(node)) {
                    var located=new Conflict(path+issue.path(),issue.productId(),issue.quote(),issue.expectedDetail());
                    out.putIfAbsent(issue.productId()+"\n"+issue.quote(),located);
                }
            for(String field:node.propertyNames())if(!Set.of("previousProfile","currentAnalysis","practicePlan","observationPlan","retrievedKnowledge").contains(field))
                recorded(node.get(field),path+"/"+field.replace("~","~0").replace("/","~1"),out);
        } else if(node.isArray())for(int i=0;i<node.size();i++)recorded(node.get(i),path+"/"+i,out);
    }
}
