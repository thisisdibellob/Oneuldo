package oneuldo.ai.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import oneuldo.ai.dto.QuestGenerationRequest;
import oneuldo.ai.dto.QuestGenerationResponse;
import oneuldo.ai.service.QuestGenerationService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/quest-step")
@RequiredArgsConstructor
public class QuestGenerationController {

    private final QuestGenerationService questGenerationService;

    @PostMapping("/generate")
    public QuestGenerationResponse generate(@Valid @RequestBody QuestGenerationRequest request) {
        return questGenerationService.generate(request);
    }
}
