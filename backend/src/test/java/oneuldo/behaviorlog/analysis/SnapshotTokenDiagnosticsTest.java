package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in, read-only local DB diagnostic. No API call and no observations printed or exported. */
@EnabledIfEnvironmentVariable(named = "AI_TOKEN_DIAGNOSTIC", matches = "true")
class SnapshotTokenDiagnosticsTest {
    @Test void 저장된_통합실패는_출력900토큰에서_끊긴_JSON이다() throws Exception {
        var mapper=JsonMapper.builder().findAndAddModules().build();
        var process=new ProcessBuilder("docker","exec","oneuldo-postgres","psql","-U","oneuldo","-d","oneuldo","-Atc",
                "SELECT attempts FROM ai_behavior_analyses WHERE id='6af4ded6-29df-4f2d-b694-ae77e53adb98';").start();
        String json=new String(process.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        assertThat(process.waitFor()).isZero();
        var attempts=mapper.readTree(json);
        assertThat(attempts.size()).isEqualTo(26);
        for(int i=24;i<26;i++) {
            String raw=attempts.get(i).path("rawOutput").asString();
            System.out.println("TRUNCATION_DIAGNOSTIC attempt="+(i+1)+" outputTokens="+QwenTokenCounter.count(raw));
            assertThatThrownBy(()->mapper.readTree(raw)).isInstanceOf(RuntimeException.class);
        }
    }
    @Test void 동일244개_스냅샷의_토큰구성과_근거복원을_확인한다() throws Exception {
        var mapper = JsonMapper.builder().findAndAddModules().build();
        var process = new ProcessBuilder("docker", "exec", "oneuldo-postgres", "psql", "-U", "oneuldo", "-d", "oneuldo", "-Atc",
                "SELECT input_data FROM behavior_analysis_input_snapshots WHERE id='dab3a096-1880-4453-8192-8c2cd21100fc';").start();
        String json = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(process.waitFor()).isZero();
        var data = mapper.readValue(json, BehaviorAnalysisInput.class);
        var input = new BehaviorAnalysisInputResponse(data.datasetId(), data.schemaVersion(), data.generatedAt(), data.sessionCount(), data.eventCount(), data);
        assertThat(input.eventCount()).isEqualTo(244);
        var factory = new AiBehaviorAnalysisPromptFactory(mapper);
        String original = factory.userPrompt(input);
        String wire = new AnalysisReferences(mapper, input).encode(original);
        var root = mapper.readTree(wire);
        System.out.println("TOKEN_DIAGNOSTIC fullInputWithFraming=" + QwenTokenCounter.inputTokens(factory.systemPrompt(), wire)
                + " beforeAlias=" + QwenTokenCounter.count(original) + " afterAlias=" + QwenTokenCounter.count(wire)
                + " chars=" + wire.length() + " system=" + QwenTokenCounter.count(factory.systemPrompt()));
        for (String name : root.propertyNames()) System.out.println("TOKEN_SECTION " + name + "=" + QwenTokenCounter.count(root.get(name).toString()));
        var before = new CompactBehaviorTimeline(mapper).decodeWithTables(mapper.readTree(original).path("behaviorTimeline"));
        var after = new CompactBehaviorTimeline(mapper).decodeWithTables(root.path("behaviorTimeline"));
        java.util.Map<String, String> originals = new java.util.HashMap<>();
        int s = 0, e = 0;
        for (var session : data.sessions()) {
            originals.put("S" + ++s, session.sessionId().toString());
            for (var event : session.events()) originals.put("E" + ++e, event.behaviorLogId().toString());
        }
        collectIds(mapper.valueToTree(data), originals);
        restore(after, originals);
        assertThat(after).isEqualTo(before);
        var pipeline = new TimelineAnalysisPipeline(factory, null, null, mapper);
        try {
            var chunks = pipeline.partition(input, 7000);
            System.out.println("TOKEN_PARTITION chunks=" + chunks.size());
            for (var chunk : chunks) System.out.println("LEAF_TOKENS events=" + chunk.eventCount() + " tokens=" + QwenTokenCounter.inputTokens(factory.observationSystem(), new AnalysisReferences(mapper,input).encode(factory.observationPrompt(chunk,input))));
        } catch (IllegalArgumentException tooLarge) { System.out.println("TOKEN_PARTITION " + tooLarge.getMessage()); }
    }
    private void collectIds(tools.jackson.databind.JsonNode node,java.util.Map<String,String> originals) {
        if (node.isString() && node.asString().matches("(?i)[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) {
            if(!originals.containsValue(node.asString())) originals.put("U"+(originals.size()+1),node.asString());
        } else if(node instanceof tools.jackson.databind.node.ObjectNode object) {
            for(String key:new java.util.TreeSet<>(object.propertyNames())) collectIds(object.get(key),originals);
        } else if(node.isArray()) node.forEach(child->collectIds(child,originals));
    }
    private void restore(tools.jackson.databind.JsonNode node, java.util.Map<String,String> originals) {
        if (node instanceof tools.jackson.databind.node.ObjectNode object) {
            for (String name : new java.util.ArrayList<>(object.propertyNames())) {
                var child = object.get(name);
                if (child.isString() && originals.containsKey(child.asString())) object.put(name, originals.get(child.asString()));
                else restore(child, originals);
            }
        } else if (node instanceof tools.jackson.databind.node.ArrayNode array) {
            for (int i = 0; i < array.size(); i++) {
                var child = array.get(i);
                if (child.isString() && originals.containsKey(child.asString())) array.set(i, new tools.jackson.databind.node.StringNode(originals.get(child.asString())));
                else restore(child, originals);
            }
        }
    }
}
