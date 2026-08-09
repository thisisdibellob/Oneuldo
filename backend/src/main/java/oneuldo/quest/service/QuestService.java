package oneuldo.quest.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
}