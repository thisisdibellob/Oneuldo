package oneuldo.behaviorlog.profile.service;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import oneuldo.behaviorlog.analysis.domain.*;
import oneuldo.behaviorlog.analysis.service.*;
import oneuldo.behaviorlog.personalization.service.MarketAiDifficultyValidator;
import oneuldo.behaviorlog.profile.domain.AiUserProfile;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/** Offline native candidate export: real factories/readers/validators, no DB or model. */
@EnabledIfEnvironmentVariable(named="ONEULDO_EXPORT_NATIVE_V2", matches="true")
class FinetuningNativeExportTest {
    final JsonMapper mapper=JsonMapper.builder().findAndAddModules().build();
    final Path out=Path.of(System.getenv().getOrDefault("ONEULDO_EXPORT_NATIVE_DIR", "../docs/ai/finetuning/native-v2"));
    final AiBehaviorAnalysisPromptFactory prompts=new AiBehaviorAnalysisPromptFactory(mapper);
    final AiBehaviorAnalysisValidator validator=new AiBehaviorAnalysisValidator(new MarketAiDifficultyValidator());
    final AiUserProfilePromptFactory profilePrompts=new AiUserProfilePromptFactory(mapper);
    final AiUserProfileValidator profileValidator=new AiUserProfileValidator(new MarketAiDifficultyValidator());
    static final List<String> F=List.of("id","skill","observation","interpretation","alternativeExplanations","evidenceEventIds","suggestedSupport");
    static final List<String> A=List.of("sessionId","judgment","explanation","evidenceEventIds");
    static final List<String> P=List.of("targetFindingIds","goal","rationale","recommendedDifficulty","itemCount","quantityComplexity","budgetPressure","textSupport","reasonCodes");
    AiUserProfile previous(JsonNode x) {
        UUID id=UUID.fromString(x.path("previousSourceSessionId").asString());
        return new AiUserProfile(id,1L,null,id,id,id,"READY","synthetic-native-v2","synthetic-upstream",
            "","",List.of(),mapper.treeToValue(x.get("previousProfile"),AiBehaviorAnalysis.class),null,0);
    }
    AiBehaviorAnalysisResponse current(JsonNode x) {
        UUID id=UUID.fromString("00000000-0000-0000-0000-000000000001");
        return new AiBehaviorAnalysisResponse(id,id,"READY","synthetic-upstream","synthetic-native-v2","none",0,0,
            Instant.parse("2026-01-31T00:00:00Z"),null,mapper.treeToValue(x.get("currentAnalysis"),AiBehaviorAnalysis.class));
    }
    ObjectNode compact(JsonNode x) {
        var r=mapper.createObjectNode();r.set("s",x.get("summary"));
        for(var pair:List.of(Map.entry("f","findings"),Map.entry("a","sessionAssessments"))) {
            var a=r.putArray(pair.getKey());var fields=pair.getKey().equals("f")?F:A;
            for(var obj:x.path(pair.getValue())) {var item=a.addArray();for(String field:fields)item.add(obj.get(field));}
        }
        r.set("u",x.get("uncertainties"));var p=r.putArray("p");for(String field:P)p.add(x.path("practicePlan").get(field));
        r.putArray("c");return r;
    }
    JsonNode fixture(String id)throws Exception {return mapper.readTree(Files.readString(out.resolve("inputs/"+id+".json")));}
    void equalTree(Object actual,JsonNode expected,String id) {JsonNode value=mapper.valueToTree(actual);assertThat(value).as(id).isEqualTo(expected);}

    @Test void all_85_native_candidates_use_real_stage_prompts_and_round_trip()throws Exception {
        var manifest=mapper.readTree(Files.readString(out.resolve("manifest.json")));
        var files=new LinkedHashMap<String,StringBuilder>();files.put("train",new StringBuilder());files.put("eval",new StringBuilder());
        var results=mapper.createArrayNode();var counts=new HashMap<String,Integer>();
        Files.createDirectories(out.resolve("expanded-inputs"));
        for(var c:manifest.path("cases")) {
            String id=c.path("id").asString(),split=c.path("split").asString(),task=c.path("task").asString();
            var input=fixture(id);var expected=c.path("expected_expanded");String system,user,answer;JsonNode expanded;
            if(task.equals("session_analysis")) {
                var dto=mapper.treeToValue(input,BehaviorAnalysisInputResponse.class);var refs=new AnalysisReferences(mapper,dto);
                system=prompts.wholeSourceSystem();user=refs.encode(prompts.wholeSourcePrompt(dto));
                answer=compact(mapper.readTree(refs.encode(expected.toString()))).toString();
                equalTree(validator.validate(refs.read(answer),dto),expected,id);
                expanded=new LosslessTables(mapper).decode(mapper.readTree(user));
                assertThat(expanded.has("evidenceCards")).isFalse();assertThat(expanded.has("chunkAnalyses")).isFalse();
                var timeline=new CompactBehaviorTimeline(mapper).decodeExpanded(expanded.path("behaviorTimeline"));
                int n=0;for(var s:timeline.path("sessions"))n+=s.path("events").size();
                assertThat(n).as(id+" retained events").isEqualTo(dto.eventCount());
                ((ObjectNode)expanded).set("behaviorTimeline",timeline);
            } else {
                var p=previous(input);var current=current(input);var refs=new AiUserProfileReferences(mapper,p,current);
                system=profilePrompts.systemPrompt();user=refs.encode(profilePrompts.userPrompt(p,current));
                var encoded=(ObjectNode)mapper.readTree(refs.encode(expected.toString()));
                encoded.remove(List.of("allowedEvidenceEventIds","referenceEncoding"));answer=encoded.toString();
                equalTree(profileValidator.validate(refs.read(answer),p,current),expected,id);
                expanded=mapper.readTree(user);
                assertThat(expanded.has("sourceEventDetails")).isFalse();assertThat(expanded.has("taskContext")).isFalse();
                assertThat(expanded.has("evidenceCards")).isFalse();
                for(var fact:c.path("fact_lineage")) {
                    String side=fact.path("side").asString().equals("current")?"currentAnalysis":"previousProfile";
                    var observations=new ArrayList<String>();
                    for(var f:expanded.path(side).path("findings"))observations.add(f.path("observation").asString());
                    assertThat(observations).as(id+" visible fact").contains(fact.path("observation").asString());
                }
                for(var f:encoded.path("findings"))for(var ref:f.path("evidenceEventIds"))
                    assertThat(expanded.path("allowedEvidenceEventIds").toString()).contains(ref.toString());
            }
            assertThat(user).doesNotContain("training_approved","must_include","must_not_claim","expected_expanded","source_review");
            var row=mapper.createObjectNode();row.put("id",id);row.put("task",task);row.put("split",split);row.put("training_approved",false);
            row.put("data_origin","SYNTHETIC_REAUTHORED_NOT_REAL_PARTICIPANT");
            var m=row.putArray("messages");m.addObject().put("role","system").put("content",system);
            m.addObject().put("role","user").put("content",user);m.addObject().put("role","assistant").put("content",answer);
            files.get(split).append(mapper.writeValueAsString(row)).append('\n');
            results.addObject().put("id",id).put("task",task).put("round_trip",true).put("production_validator",true).put("actual_factory",true);
            counts.merge(split+"/"+task,1,Integer::sum);
            Files.writeString(out.resolve("expanded-inputs/"+id+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(expanded)+"\n");
        }
        assertThat(counts).containsEntry("train/session_analysis",40).containsEntry("train/profile_update",20)
            .containsEntry("eval/session_analysis",17).containsEntry("eval/profile_update",8);
        for(var f:files.entrySet()) {
            Path destination=out.resolve(f.getKey()+".candidate.jsonl");
            if (f.getKey().equals("eval") && Files.exists(destination)) {
                var generated=f.getValue().toString().lines().toList();
                var frozen=Files.readString(destination).lines().toList();
                assertThat(generated).hasSameSizeAs(frozen);
                for (int i=0;i<generated.size();i++) {
                    JsonNode a=mapper.readTree(generated.get(i)), b=mapper.readTree(frozen.get(i));
                    // Map iteration order is not a semantic input change. Preserve
                    // the original file bytes rather than reserializing evaluation.
                    for (JsonNode row:List.of(a,b)) {
                        for (JsonNode msg:row.path("messages")) {
                            if (!msg.path("role").asString().equals("system")) {
                                ((ObjectNode)msg).set("content",mapper.readTree(msg.path("content").asString()));
                            }
                        }
                    }
                    assertThat(a).as("Frozen evaluation semantics case "+i).isEqualTo(b);
                }
            } else Files.writeString(destination,f.getValue());
        }
        Files.writeString(out.resolve("production-validation.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(results)+"\n");
    }
    @Test void missing_profile_report_cannot_be_cited()throws Exception {
        var x=fixture("E22");var removed=x.deepCopy();
        ((ObjectNode)removed.path("currentAnalysis")).putArray("findings").add(x.path("currentAnalysis").path("findings").get(1));
        var refs=new AiUserProfileReferences(mapper,previous(removed),current(removed));
        String report=x.path("currentAnalysis").path("findings").get(0).path("evidenceEventIds").get(0).asString();
        var raw=mapper.createObjectNode();raw.putArray("findings").addObject().putArray("evidenceEventIds").add(report);
        assertThatThrownBy(()->refs.read(refs.encode(raw.toString()))).isInstanceOf(IllegalArgumentException.class);
        ((ObjectNode)raw.path("findings").get(0)).putArray("evidenceEventIds").add("R999");
        assertThatThrownBy(()->refs.read(raw.toString())).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void same_session_flag_uses_real_factory()throws Exception {
        for(String id:List.of("T21","T22","T24","T51","E21")) {
            var x=fixture(id);var prompt=mapper.readTree(profilePrompts.userPrompt(previous(x),current(x)));
            assertThat(prompt.path("sameSessionReanalysis").asBoolean()).as(id).isEqualTo(!id.equals("E21"));
        }
    }
}
