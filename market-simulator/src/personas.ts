import cautious from '../personas/careful-checker.json';
import quick from '../personas/quick-decider.json';
import original from '../personas/mild-intellectual-disability-adult.json';
import type { Persona } from './types';
import control from '../personas/neutral-adult-control.json';
import { AsyncLocalStorage } from 'node:async_hooks';

const profiles = [original, cautious, quick] as Persona[];
// Validation controls are deliberately outside the ordinary generation/learner registry.
const validationProfiles = [control] as Persona[];
export const VALIDATION_CONTROL_PERSONA_ID = control.id;
const { assertValidPersona } = require('./validation/personaTraitProfiles.cjs') as {
  assertValidPersona: (value: unknown) => Persona;
};
const validationPersona = new AsyncLocalStorage<Persona>();
/** The server enters this scope only after binding a validation run's whole-trace slot. */
export function withValidationPersona<T>(work: () => T, persona?: Persona): T {
  const selected = assertValidPersona(persona ?? validationProfiles[0]);
  // A scope owns a clone so caller mutation cannot alter an in-flight generation.
  return validationPersona.run(structuredClone(selected), work);
}
export function listPersonas(): Persona[] { return structuredClone(profiles); }
export function getPersona(id: string): Persona {
  const profile = profiles.find(p => p.id === id);
  if (!profile) throw new Error(`Unknown persona: ${id}. Use list_personas.`);
  return structuredClone(profile);
}
/** Whole-trace identity lookup only; a validation scope never widens getPersona. */
export function getWholeTracePersona(id: string): Persona {
  const profile = validationPersona.getStore();
  return profile?.id === id ? structuredClone(profile) : getPersona(id);
}
export function assertPersonaLearningAllowed(id: string): void {
  if (id === VALIDATION_CONTROL_PERSONA_ID || !profiles.some(profile => profile.id === id))
    throw new Error(`Invalid personaId ${id}: validation-only or unknown personas are excluded from learners and learning trials`);
}
