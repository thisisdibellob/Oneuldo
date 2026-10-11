import cautious from '../personas/careful-checker.json';
import quick from '../personas/quick-decider.json';
import original from '../personas/mild-intellectual-disability-adult.json';
import type { Persona } from './types';
import control from '../personas/neutral-adult-control.json';
import { AsyncLocalStorage } from 'node:async_hooks';

const profiles = [original, cautious, quick] as Persona[];
const validationPersona = new AsyncLocalStorage<boolean>();
export function withValidationPersona<T>(work: () => T): T { return validationPersona.run(true, work); }
export function listPersonas(): Persona[] { return structuredClone(profiles); }
export function getPersona(id: string): Persona {
  const profile = profiles.find(p => p.id === id) ?? (id === control.id && validationPersona.getStore() ? control as Persona : undefined);
  if (!profile) throw new Error(`Unknown persona: ${id}. Use list_personas.`);
  return structuredClone(profile);
}
