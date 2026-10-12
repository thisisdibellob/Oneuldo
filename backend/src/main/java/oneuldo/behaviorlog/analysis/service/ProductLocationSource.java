package oneuldo.behaviorlog.analysis.service;

import java.util.*;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

/** Literal version-scoped catalog projection, never a location/ability judgment. */
public final class ProductLocationSource {
    private ProductLocationSource() {}
    public static ObjectNode build(ObjectMapper mapper,JsonNode catalog) {
        var root=mapper.createObjectNode();
        for(String key:List.of("catalogVersion","version","scope"))if(catalog.has(key))root.set(key,catalog.get(key).deepCopy());
        var products=root.putArray("products");collect(catalog,products,new HashSet<>());
        return root;
    }
    private static void collect(JsonNode node,ArrayNode products,Set<String> seen) {
        if(node.isObject() && node.path("id").isString() && node.path("categoryId").isString()) {
            var copy=products.addObject();
            // Location-only index. Original specification/units remain in the task and event sources.
            for(String key:List.of("id","name","categoryId","storageType","storage"))
                if(node.has(key))copy.set(key,node.get(key).deepCopy());
            if(!seen.add(copy.toString()))products.remove(products.size()-1);
        }
        if(node.isObject() || node.isArray())for(var child:node)collect(child,products,seen);
    }
}
