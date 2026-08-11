package oneuldo.quest.controller;

import lombok.RequiredArgsConstructor;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.quest.service.QuestService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/quest")
@RequiredArgsConstructor
public class QuestController {

    private final QuestService questService;

    @GetMapping
    public List<QuestSummaryResponse> getQuests() {
        return questService.findActiveQuests();
    }

    @GetMapping("/{uuid}")
    public QuestSummaryResponse getQuest(@PathVariable UUID uuid) {
        return questService.findQuest(uuid);
    }
}
