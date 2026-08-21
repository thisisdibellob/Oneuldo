package oneuldo.simulationquest.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import oneuldo.global.exception.ActiveQuestNotFoundException;
import oneuldo.global.exception.PlaceNotFoundException;
import oneuldo.global.exception.SimulationNotFoundException;
import oneuldo.member.domain.Member;
import oneuldo.member.domain.MemberQuestProfile;
import oneuldo.member.repository.MemberQuestProfileRepository;
import oneuldo.place.domain.Place;
import oneuldo.place.repository.PlaceRepository;
import oneuldo.quest.domain.Quest;
import oneuldo.quest.repository.QuestRepository;
import oneuldo.simulationquest.domain.Simulation;
import oneuldo.simulationquest.domain.SimulationQuest;
import oneuldo.simulationquest.repository.SimulationRepository;

public class AlgorithmGenerator implements SimulationQuestGenerator {

    private static final int CATEGORY_WEIGHT = 40;
    private static final int DIFFICULTY_WEIGHT = 50;
    private static final int EXPLORATION_WEIGHT = 10;

    private final QuestRepository questRepository;
    private final MemberQuestProfileRepository profileRepository;
    private final SimulationRepository simulationRepository;
    private final PlaceRepository placeRepository;
    private final Clock clock;

    public AlgorithmGenerator(
            QuestRepository questRepository,
            MemberQuestProfileRepository profileRepository,
            SimulationRepository simulationRepository,
            PlaceRepository placeRepository
    ) {
        this(
                questRepository,
                profileRepository,
                simulationRepository,
                placeRepository,
                Clock.systemDefaultZone()
        );
    }

    AlgorithmGenerator(
            QuestRepository questRepository,
            MemberQuestProfileRepository profileRepository,
            SimulationRepository simulationRepository,
            PlaceRepository placeRepository,
            Clock clock
    ) {
        this.questRepository = questRepository;
        this.profileRepository = profileRepository;
        this.simulationRepository = simulationRepository;
        this.placeRepository = placeRepository;
        this.clock = clock;
    }

    @Override
    public SimulationQuest create(Member member) {
        MemberQuestProfile profile = profileRepository.findByMemberId(member.getId())
                .orElseGet(() -> MemberQuestProfile.defaultFor(member));

        List<ScoredQuest> rankedQuests = questRepository.findAllActiveWithCategory()
                .stream()
                .map(candidate -> new ScoredQuest(candidate, calculateScore(member, profile, candidate)))
                .sorted(Comparator.comparingInt(ScoredQuest::score)
                        .reversed()
                .thenComparing(scored -> scored.quest().getCode()))
                .toList();

        if (rankedQuests.isEmpty()) {
            throw new ActiveQuestNotFoundException();
        }

        boolean simulationFound = false;

        for (ScoredQuest scoredQuest : rankedQuests) {
            List<Simulation> simulations = simulationRepository
                    .findAllByQuestIdAndActiveTrueOrderByTitle(scoredQuest.quest().getId());

            if (simulations.isEmpty()) {
                continue;
            }

            simulationFound = true;
            List<SimulationPlace> availableSimulations = findAvailableSimulations(simulations);

            if (!availableSimulations.isEmpty()) {
                SimulationPlace selected = selectSimulation(member, availableSimulations);
                return new SimulationQuest(
                        UUID.randomUUID(),
                        scoredQuest.quest(),
                        selected.place().getCode(),
                        selected.simulation(),
                        List.of()
                );
            }
        }

        if (!simulationFound) {
            throw new SimulationNotFoundException();
        }

        throw new PlaceNotFoundException();
    }

    private int calculateScore(Member member, MemberQuestProfile profile, Quest quest) {
        int categoryScore = calculateCategoryScore(profile, quest);
        int difficultyScore = calculateDifficultyScore(profile, quest);
        int explorationScore = calculateExplorationScore(member, quest);
        return categoryScore + difficultyScore + explorationScore;
    }

    private int calculateCategoryScore(MemberQuestProfile profile, Quest quest) {
        if (profile.getPreferredSubcategoryCodes().isEmpty()) {
            return CATEGORY_WEIGHT / 2;
        }

        return profile.prefers(quest.getSubcategory().getCode()) ? CATEGORY_WEIGHT : 0;
    }

    private int calculateDifficultyScore(MemberQuestProfile profile, Quest quest) {
        int distance = Math.abs(
                profile.getPreferredDifficulty().ordinal() - quest.getDifficulty().ordinal()
        );
        return switch (distance) {
            case 0 -> DIFFICULTY_WEIGHT;
            case 1 -> 35;
            case 2 -> 20;
            case 3 -> 10;
            default -> 0;
        };
    }

    private int calculateExplorationScore(Member member, Quest quest) {
        LocalDate today = LocalDate.now(clock);
        int hash = java.util.Objects.hash(member.getId(), quest.getId(), today);
        return Math.floorMod(hash, EXPLORATION_WEIGHT + 1);
    }

    private List<SimulationPlace> findAvailableSimulations(List<Simulation> simulations) {
        return simulations.stream()
                .flatMap(simulation -> placeRepository
                        .findByIdAndActiveTrue(simulation.getPlaceId())
                        .map(place -> new SimulationPlace(simulation, place))
                        .stream())
                .toList();
    }

    private SimulationPlace selectSimulation(
            Member member,
            List<SimulationPlace> simulations
    ) {
        int hash = java.util.Objects.hash(member.getId(), LocalDate.now(clock));
        return simulations.get(Math.floorMod(hash, simulations.size()));
    }

    private record ScoredQuest(Quest quest, int score) {}

    private record SimulationPlace(Simulation simulation, Place place) {}
}
