package oneuldo.quest.service;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import oneuldo.quest.dto.QuestSummaryResponse;
import oneuldo.quest.repository.QuestRepository;

// 퀘스트 조회 기능을 처리하는 Service
@Service
@RequiredArgsConstructor
public class QuestService {

    private final QuestRepository questRepository;

    // 활성화된 퀘스트 목록을 조회함
    @Transactional(readOnly = true)
    public List<QuestSummaryResponse> findActiveQuests() {

        return questRepository.findAllActiveWithCategory()
                .stream()
                .map(QuestSummaryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public QuestSummaryResponse findQuest(UUID uuid) {
        return questRepository.findById(uuid)
                .map(QuestSummaryResponse::from)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "퀘스트를 찾을 수 없습니다."
                ));
    }
}
