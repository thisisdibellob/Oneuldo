package oneuldo.behaviorlog.personalization.service;

import java.util.*;
import oneuldo.ai.client.GroqChatClient.GroqChatResult;
import oneuldo.behaviorlog.analysis.service.AnalysisCheckpoints;
import oneuldo.behaviorlog.personalization.domain.MarketAiQuestGeneration;
import tools.jackson.databind.*;

/** Resumes only exact, owner-scoped source requests; every rejected model response remains auditable. */
final class AdaptiveObservationRequests {
    static final int REPAIR_CALLS = 2;
    static final int REPAIR_RESERVE_TOKENS = 192;
    interface Transport { GroqChatResult call(String system, String prompt, int output); }
    private final ObjectMapper mapper;
    private final Transport transport;
    private final AnalysisCheckpoints checkpoints;
    private final List<MarketAiQuestGeneration.Attempt> audit;
    private int repairs;

    AdaptiveObservationRequests(ObjectMapper mapper, Transport transport, AnalysisCheckpoints checkpoints,
            List<MarketAiQuestGeneration.Attempt> audit) {
        this.mapper=mapper; this.transport=transport; this.checkpoints=checkpoints; this.audit=audit;
    }

    JsonNode request(String system, String prompt, int output, Set<String> allowed, String stage,
            Map<String,Object> context) {
        // The checkpoint API predates temperature options; namespace these zero-temperature requests explicitly.
        String cacheSystem=system+"\nAdaptive observation temperature=0.0; checkpoint-v1";
        var cached=checkpoints.find(cacheSystem,prompt,output);
        if(cached.isPresent()) {
            try {
                var result=validate(cached.get(),allowed);
                record(cached.get(),system,prompt,stage,context,null,"CHECKPOINT"); return result;
            } catch(RuntimeException ignored) { /* A prior response must pass the current source/schema checks. */ }
        }
        String submittedSystem=system;
        while(true) {
            var response=transport.call(submittedSystem,prompt,output);
            try {
                var result=validate(response,allowed);
                record(response,submittedSystem,prompt,stage,context,null,"LIVE");
                checkpoints.save(cacheSystem,prompt,output,response); return result;
            } catch(RuntimeException invalid) {
                String code=invalid instanceof InvalidObservation problem?problem.getMessage():"INVALID_OBSERVATION_JSON";
                record(response,submittedSystem,prompt,stage,context,code,"LIVE");
                if(repairs++>=REPAIR_CALLS) throw invalid;
                submittedSystem=system+" Previous response failed "+code+". Return the complete required JSON with all six fields and only literal E IDs present in this same source. Do not invent or infer missing IDs. Keep observations concise to finish within the output limit. Original source is unchanged.";
            }
        }
    }

    private JsonNode validate(GroqChatResult response, Set<String> allowed) {
        if("length".equals(response.finishReason())) throw new InvalidObservation("OBSERVATION_OUTPUT_TRUNCATED");
        var item=mapper.readTree(response.text());
        if(!item.isObject() || !item.path("evidenceIds").isArray() || item.path("evidenceIds").isEmpty()
                || item.path("evidenceIds").size()>12) throw new InvalidObservation("INVALID_OBSERVATION_SCHEMA");
        for(String field:List.of("behaviorObservation","movementObservation","nextObservationQuestion"))
            if(!item.path(field).isString() || item.path(field).asString().isBlank()) throw new InvalidObservation("INVALID_OBSERVATION_SCHEMA");
        for(String field:List.of("alternativeExplanations","unknowns")) {
            if(!item.path(field).isArray()) throw new InvalidObservation("INVALID_OBSERVATION_SCHEMA");
            for(var value:item.path(field)) if(!value.isString()) throw new InvalidObservation("INVALID_OBSERVATION_SCHEMA");
        }
        for(var cite:item.path("evidenceIds"))
            if(!cite.isString() || !allowed.contains(cite.asString())) throw new InvalidObservation("INVALID_OBSERVATION_CITATION");
        return item;
    }

    private void record(GroqChatResult response, String system, String prompt, String stage,
            Map<String,Object> context, String failure, String source) {
        var detail=new LinkedHashMap<String,Object>(context);
        detail.put("stage",stage); detail.put("submittedPrompt",prompt); detail.put("systemPrompt",system);
        detail.put("source",source);
        if(response.finishReason()!=null) detail.put("finishReason",response.finishReason());
        if(response.inputTokens()!=null) detail.put("inputTokens",response.inputTokens());
        if(response.outputTokens()!=null) detail.put("outputTokens",response.outputTokens());
        audit.add(new MarketAiQuestGeneration.Attempt(audit.size()+1,response.text(),failure,detail));
    }

    private static final class InvalidObservation extends IllegalArgumentException {
        InvalidObservation(String code) { super(code); }
    }
}
