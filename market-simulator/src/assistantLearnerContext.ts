import { validateLearning, type PracticeEpisode } from './actorLearning';
export { researchLearnerContext, researchEncodingContext, researchRetrievalContext, researchPracticeAudit,
  researchLearnerProfile } from './researchLearnerContext';

export type AssistantExperience = {
  version: 'assistant-observed-v1';
  personaId: string;
  episodes: { id: string; sessionId: string; observationRef: string; observed: PracticeEpisode }[];
  learnerNotes: { kind: 'tentative-strategy'; text: string; episodeIds: string[] }[];
};

/** Legacy v1 archive reader. New direct-assistant trials use researchLearnerContext (v2). */
export function assistantLearnerContext(value: AssistantExperience) {
  const keys = (obj: object, allowed: string[]) => Object.keys(obj).every(key => allowed.includes(key));
  if (!value || !keys(value, ['version', 'personaId', 'episodes', 'learnerNotes'])
    || value.version !== 'assistant-observed-v1' || typeof value.personaId !== 'string' || !value.personaId
    || !Array.isArray(value.episodes) || value.episodes.length > 100
    || !Array.isArray(value.learnerNotes) || value.learnerNotes.length > 12
    || JSON.stringify(value).length > 80000) throw new Error('INVALID_ASSISTANT_EXPERIENCE');
  const ids = new Set<string>();
  for (const episode of value.episodes) {
    if (!episode || !keys(episode, ['id', 'sessionId', 'observationRef', 'observed'])
      || [episode.id, episode.sessionId, episode.observationRef].some(x => typeof x !== 'string' || !x || x.length > 500)
      || ids.has(episode.id)) throw new Error('INVALID_OBSERVATION_REFERENCE');
    ids.add(episode.id);
    // Share the existing episodic boundary, including rejection of analysis/mastery fields.
    validateObservedEpisode(episode.observed);
  }
  for (const note of value.learnerNotes) {
    if (!note || !keys(note, ['kind', 'text', 'episodeIds']) || note.kind !== 'tentative-strategy'
      || typeof note.text !== 'string' || !note.text.trim() || note.text.length > 300
      || !Array.isArray(note.episodeIds) || note.episodeIds.length < 1 || note.episodeIds.length > 8
      || note.episodeIds.some(id => !ids.has(id))) throw new Error('UNSUPPORTED_LEARNER_NOTE');
  }
  return structuredClone({
    version: value.version, personaId: value.personaId,
    observedExperience: value.episodes, tentativeLearnerNotes: value.learnerNotes,
    scope: 'Available observations and learner-authored tentative strategies. No automatic mastery or guaranteed recall. '
      + 'The actor may use, forget, misunderstand or revise a note without a forced failure/success quota. '
      + 'Structural validation does not prove the receipt is authentic or the text is free of inference; verify source observations before use.',
  });
}

function validateObservedEpisode(observed: PracticeEpisode) {
  validateLearning({ version: '1', source: 'confirmed-app-replay', memberId: 'validation-only',
    sessionId: 'validation-only', replayId: 'validation-only', episodes: [observed] });
}
