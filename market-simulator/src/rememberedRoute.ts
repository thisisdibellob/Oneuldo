import type { ActorObservation } from './types';

export const REMEMBERED_ROUTE_CONTRACT = 'remembered-route-v1' as const;
export type RememberedPlace = { id: string; label: string; passages: number };
type RouteLike = { action: string; from: string | null; to: string; seenStationIds: string[] };

/** remembered-route-v1: for each currently offered passage, the places the actor itself saw after walking on from
 * that passage in earlier rounds. Uses only the routes already shown to the actor (no added capacity), never map
 * geometry, never ranks places by the task, and never adds a movement the ordinary passage choice cannot perform. */
export function rememberedRouteCues(routes: RouteLike[], o: ActorObservation, labels: Map<string, string>, maxPassages = 6, maxPlaces = 4): Map<string, RememberedPlace[]> {
  const next = new Map<string, Set<string>>(), seenAt = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(v); };
  for (const r of routes) {
    if (r.action === 'walkToAnchor') {
      if (r.from) add(next, r.from, r.to);
      for (const s of r.seenStationIds) add(seenAt, r.to, s);
    } else if (r.action === 'walkTo' && r.from) add(seenAt, r.from, r.to);
  }
  // A place that can already be approached or used now needs no memory cue.
  const present = new Set<string>(o.visibleStations.filter(s => s.near || s.approachable).map(s => s.id));
  const cues = new Map<string, RememberedPlace[]>();
  for (const anchor of o.anchors) {
    const best = new Map<string, number>(), depth = new Map<string, number>([[anchor.id, 1]]), queue = [anchor.id];
    while (queue.length) {
      const at = queue.shift()!, d = depth.get(at)!;
      for (const s of seenAt.get(at) ?? []) if (!present.has(s) && labels.has(s) && !(best.get(s)! <= d)) best.set(s, d);
      if (d >= maxPassages) continue;
      for (const n of next.get(at) ?? []) if (!depth.has(n)) { depth.set(n, d + 1); queue.push(n); }
    }
    const places = [...best].map(([id, passages]) => ({ id, label: labels.get(id)!, passages }))
      .sort((a, b) => a.passages - b.passages || a.id.localeCompare(b.id)).slice(0, maxPlaces);
    if (places.length) cues.set(anchor.id, places);
  }
  return cues;
}
