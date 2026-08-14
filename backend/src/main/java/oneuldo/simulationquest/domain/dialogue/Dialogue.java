package oneuldo.simulationquest.domain.dialogue;

public record Dialogue(
        DialoguePhase phase,
        int sequence,
        String speakerId,
        String text,
        Emotion emotion
) {
}