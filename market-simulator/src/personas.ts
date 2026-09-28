import cautious from '../personas/careful-checker.json';
import quick from '../personas/quick-decider.json';
import original from '../personas/mild-intellectual-disability-adult.json';
import type { Persona } from './types';

const profiles = [original, cautious, quick] as Persona[];
export function listPersonas(): Persona[] { return structuredClone(profiles); }
export function getPersona(id: string): Persona {
  const profile = profiles.find(p => p.id === id);
  if (!profile) throw new Error(`Unknown persona: ${id}. Use list_personas.`);
  return structuredClone(profile);
}
