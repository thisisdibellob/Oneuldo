package oneuldo.behaviorlog.analysis;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.BehaviorAnalysisInputResponse;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.profile.service.AiUserProfilePromptFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Explicit, offline export: production factories/parsers, no Spring/DB/HTTP/model calls. */
@EnabledIfEnvironmentVariable(named="ONEULDO_EXPORT_FINETUNING_CONTRACT", matches="true")
class FinetuningContractExportTest {
    private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
    private final Path base = Path.of("../docs/ai/finetuning");
    private final Path out = base.resolve("contract-v1");
    private final AiBehaviorAnalysisPromptFactory prompts = new AiBehaviorAnalysisPromptFactory(mapper);
    private final AiBehaviorAnalysisValidator validator = new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());

    private Map<String, JsonNode> rows() throws Exception {
        Map<String, JsonNode> result = new LinkedHashMap<>();
        for (String split : List.of("train", "eval"))
            for (String line : Files.readAllLines(base.resolve("seed-v1/" + split + ".draft.jsonl"))) {
                var row = mapper.readTree(line);
                result.put(row.path("id").asString(), row);
            }
        return result;
    }

    /** Only the identity skeleton is needed by AnalysisReferences; never sent as model input. */
    private BehaviorAnalysisInputResponse identities(JsonNode seed) {
        var payload = mapper.readTree(seed.path("messages").get(1).path("content").asString());
        var root = mapper.createObjectNode();
        var input = root.putObject("input");
        root.put("sessionCount",payload.path("taskContext").size());
        root.put("eventCount",payload.path("sourceEventDetails").size());
        input.put("sessionCount",payload.path("taskContext").size());
        input.put("eventCount",payload.path("sourceEventDetails").size());
        var sessions = input.putArray("sessions");
        for (var context : payload.path("taskContext")) {
            var s = sessions.addObject(); s.set("sessionId", context.get("sessionId"));
            var events = s.putArray("events");
            for (var e : payload.path("sourceEventDetails"))
                if (e.get("sessionId").equals(context.get("sessionId"))) {
                    var event = events.addObject();event.set("behaviorLogId",e.get("id"));
                    event.set("sequence",e.get("sequence"));
                    event.put("elapsedFromSessionStartMs",0);
                }
        }
        return mapper.treeToValue(root, BehaviorAnalysisInputResponse.class);
    }

    @Test void all_57_compact_targets_round_trip_through_actual_parser_and_validator() throws Exception {
        var seeds = rows(); var results = mapper.createArrayNode();
        for (String line : Files.readAllLines(out.resolve("compact-targets.preview.jsonl"))) {
            var row = mapper.readTree(line);String id = row.path("id").asString();
            var source = seeds.get(id); var input = identities(source);
            var refs = new AnalysisReferences(mapper, input);
            var restored = validator.validate(refs.read(row.path("compact_target").toString()), input);
            var expected = (ObjectNode)mapper.readTree(source.path("messages").get(2).path("content").asString());
            expected.putArray("usedEvidenceCardIds");
            JsonNode restoredTree = mapper.valueToTree(restored);
            assertThat(restoredTree).as(id).isEqualTo(expected);
            results.addObject().put("id",id).put("roundTrip",true).put("productionValidator",true);
        }
        assertThat(results.size()).isEqualTo(57);
        Files.writeString(out.resolve("production-parser-results.json"), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(results)+"\n");
    }

    @Test void native_fixture_messages_are_built_by_the_production_whole_source_path() throws Exception {
        var targets = new HashMap<String,JsonNode>();
        for(String line:Files.readAllLines(out.resolve("compact-targets.preview.jsonl"))) {
            var row=mapper.readTree(line);targets.put(row.path("id").asString(),row.path("compact_target"));
        }
        var manifest=mapper.readTree(Files.readString(out.resolve("migration-manifest.json")));
        var messages=new StringBuilder(); var sizes=mapper.createArrayNode();
        for(var c:manifest.path("cases")) {
            if(!c.path("native_fixture").asBoolean())continue;
            String id=c.path("id").asString();
            var input=mapper.readValue(Files.readString(out.resolve("inputs/"+id+".json")),BehaviorAnalysisInputResponse.class);
            String before=mapper.writeValueAsString(input);
            var refs=new AnalysisReferences(mapper,input);
            String system=prompts.wholeSourceSystem();
            String user=refs.encode(prompts.wholeSourcePrompt(input));
            String answer=targets.get(id).toString();
            validator.validate(refs.read(answer),input);
            assertThat(mapper.writeValueAsString(input)).isEqualTo(before);
            var expanded=new LosslessTables(mapper).decode(mapper.readTree(user));
            assertThat(expanded.path("evidenceCards").isMissingNode()).isTrue();
            assertThat(expanded.path("taskContext").size()).isEqualTo(input.sessionCount());
            assertThat(expanded.path("sourceEventDetails").size()).isEqualTo(input.eventCount());
            assertThat(user).doesNotContain("rubric", "must_include", "must_not_claim", "training_approved");
            var row=mapper.createObjectNode();row.put("id",id);row.set("split",c.get("split"));
            row.put("training_approved",false);row.put("status","NATIVE_DTO_SYNTHETIC_PREVIEW");
            var turns=row.putArray("messages");
            turns.addObject().put("role","system").put("content",system);
            turns.addObject().put("role","user").put("content",user);
            turns.addObject().put("role","assistant").put("content",answer);
            messages.append(mapper.writeValueAsString(row)).append('\n');
            sizes.addObject().put("id",id).put("localBpePromptPlus64",QwenTokenCounter.inputTokens(system,user))
                    .put("assistantTextTokens",QwenTokenCounter.count(answer));
        }
        assertThat(sizes.size()).isEqualTo(6);
        Files.writeString(out.resolve("native-messages.preview.jsonl"),messages);
        Files.writeString(out.resolve("local-bpe-counts.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(sizes)+"\n");
        var contract=mapper.createObjectNode();
        contract.put("analysisPromptVersion",AiBehaviorAnalysisPromptFactory.VERSION);
        contract.put("synthesisVersion",AnalysisSynthesisPrompt.VERSION);
        contract.put("reviewVersion",AnalysisReviewPrompt.VERSION);
        contract.put("profileVersion",AiUserProfilePromptFactory.VERSION);
        contract.put("wholeSourceSystem",prompts.wholeSourceSystem());
        contract.put("finalOutputContract",AnalysisSynthesisPrompt.CONTRACT);
        contract.put("reviewSystem",AnalysisReviewPrompt.system());
        contract.put("profileSystem",new AiUserProfilePromptFactory(mapper).systemPrompt());
        Files.writeString(out.resolve("production-contract.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(contract)+"\n");
    }

    @Test void unknown_and_cross_session_citations_fail_and_changed_judgment_is_not_rule_scored() throws Exception {
        var seed=rows().get("E06");var input=identities(seed);var refs=new AnalysisReferences(mapper,input);
        var original=mapper.readTree(seed.path("messages").get(2).path("content").asString());
        ((ObjectNode)original).putArray("usedEvidenceCardIds");
        var aliased=(ObjectNode)mapper.readTree(refs.encode(original.toString()));
        // encode adds a prompt annotation, which is not part of an output.
        aliased.remove("referenceEncoding");
        var unknown=aliased.deepCopy();
        ((ObjectNode)unknown.path("findings").get(0)).putArray("evidenceEventIds").add("E999");
        assertThatThrownBy(()->refs.read(unknown.toString())).isInstanceOf(IllegalArgumentException.class);
        var cross=aliased.deepCopy();
        ((ObjectNode)cross.path("sessionAssessments").get(0)).putArray("evidenceEventIds").add("E2");
        assertThatThrownBy(()->validator.validate(refs.read(cross.toString()),input)).isInstanceOf(IllegalArgumentException.class);
        var changed=aliased.deepCopy();
        ((ObjectNode)changed.path("sessionAssessments").get(0)).put("judgment","FAILURE");
        // Schema validation must not become an automatic success/failure classifier.
        assertThatCode(()->validator.validate(refs.read(changed.toString()),input)).doesNotThrowAnyException();
    }
}
