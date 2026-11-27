package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.*;

/**
 * Four catalog products have a size that is itself a count (사과 1개, 초록 사과 1개, 배 1개, 낱개 바나나 1개).
 * Text that writes the size and then the quantity ("사과 1개 2개") reads as a doubled count. The program writes
 * the quantity after such a size as "사과 1개짜리 2개", only right after the full name and size of a selected
 * objective product. Nothing else is rewritten (teacher-eval-20261118 fix1: the model repeated the doubled form
 * through every repair turn when it was only told the rule).
 */
final class AdaptiveQuestCountWording {
    private AdaptiveQuestCountWording() {}
    static final Pattern COUNT_SIZE=Pattern.compile("\\d+\\s*개");
    private static final List<String> TEXT_FIELDS=List.of("title","description","successMessage","adaptationSummary");
    private static final List<String> LINE_FIELDS=List.of("briefing","checkoutDialogue");

    /** Rewrites the candidate's learner-facing text in place and returns one entry per changed text. */
    static List<Map<String,Object>> normalize(JsonNode candidate) {
        var changes=new ArrayList<Map<String,Object>>();
        if(!(candidate instanceof ObjectNode quest))return changes;
        var patterns=new ArrayList<Map.Entry<MarketQuestCatalog.Product,Pattern>>();
        for(var objective:quest.path("objectives"))for(var product:MarketQuestCatalog.PRODUCTS)
            if(product.id().equals(objective.path("productId").asString())&&COUNT_SIZE.matcher(product.detail()).matches())
                patterns.add(Map.entry(product,Pattern.compile(Pattern.quote(product.name())+"\\s*"+Pattern.quote(product.detail())+"\\s+(\\d+\\s*개)")));
        if(patterns.isEmpty())return changes;
        for(String field:TEXT_FIELDS)if(quest.path(field).isString()) {
            String before=quest.path(field).asString(),after=rewrite(before,patterns);
            if(!after.equals(before)){quest.put(field,after);changes.add(Map.of("path","/"+field,"from",before,"to",after));}
        }
        for(String field:LINE_FIELDS)if(quest.path(field) instanceof ArrayNode lines)for(int i=0;i<lines.size();i++)if(lines.get(i).isString()) {
            String before=lines.get(i).asString(),after=rewrite(before,patterns);
            if(!after.equals(before)){lines.set(i,lines.stringNode(after));changes.add(Map.of("path","/"+field+"/"+i,"from",before,"to",after));}
        }
        return changes;
    }
    private static String rewrite(String text,List<Map.Entry<MarketQuestCatalog.Product,Pattern>> patterns) {
        for(var entry:patterns) {
            var p=entry.getKey();
            text=entry.getValue().matcher(text).replaceAll(m->java.util.regex.Matcher.quoteReplacement(p.name()+" "+p.detail()+"짜리 "+m.group(1)));
        }
        return text;
    }
}
