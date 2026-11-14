#!/usr/bin/env python3
"""Supervisor-only route metrics for offline whole-trace rounds (read-only).

For one round folder (gN/rR or pilot/gNN) it reads the supervisor world reference and the
actor's executor responses, and reports:
  - shortest walk count: start -> every target shelf (any order) -> a checkout, on the
    waypoint graph the actor walks (navigation.states[initial].nodes / allowedWaypointIds)
  - actor walks (walkToAnchor decisions) and wasted walks = walks - shortest
  - first decision number at which each target shelf sign was visible, and when any was

Usage: route_metrics.py <experiment-dir> [<round-rel> ...]   (default: every gN/rR with outcome.json)
Prints one JSON line per round. Never shown to actors or teachers.
"""
import itertools, json, pathlib, sys
from collections import deque

CATEGORY = {}  # productId -> shelf station id, filled from the world reference shelves


def load(p):
    return json.loads(pathlib.Path(p).read_text())


def graph(world_ref):
    nav = world_ref['navigation']
    state = next(s for s in nav['states'] if s['stateId'] == nav['initialStateId'])
    adj = {n['waypointId']: n['allowedWaypointIds'] for n in state['nodes']}
    stations = {}
    for n in state['nodes']:
        for s in n['nearbyStations']:
            stations.setdefault(s['id'], set()).add(n['waypointId'])
    return state['start']['allowedWaypointIds'], adj, stations


def bfs(adj, sources):
    dist = {s: 1 for s in sources}  # one walk reaches a waypoint allowed from the current spot
    q = deque(sources)
    while q:
        u = q.popleft()
        for v in adj.get(u, []):
            if v not in dist:
                dist[v] = dist[u] + 1
                q.append(v)
    return dist


def shortest(world_ref, shelves):
    start, adj, stations = graph(world_ref)
    if any(s not in stations for s in shelves):
        return None
    checkout = [s for s in stations if s.startswith('checkout')]
    best = None
    cache = {}

    def from_point(src):  # src is a waypoint id, distances in walks
        if src not in cache:
            cache[src] = bfs(adj, adj.get(src, []))
            cache[src][src] = 0
        return cache[src]

    start_d = bfs(adj, start)
    for order in itertools.permutations(shelves):
        # dynamic programming over the waypoints of each shelf in this order
        layer = {w: start_d.get(w) for w in stations[order[0]] if start_d.get(w) is not None}
        for shelf in order[1:]:
            nxt = {}
            for w, c in layer.items():
                d = from_point(w)
                for t in stations[shelf]:
                    if t in d and (t not in nxt or c + d[t] < nxt[t]):
                        nxt[t] = c + d[t]
            layer = nxt
        for w, c in layer.items():
            d = from_point(w)
            for co in checkout:
                for t in stations[co]:
                    if t in d and (best is None or c + d[t] < best):
                        best = c + d[t]
    return best


def first_signs(round_dir, shelves, labels):
    seen = {}
    # Actors name their saved responses freely (*.out.json, *-out-*.json); only executor responses
    # carry acceptedDecisionCount next to visibleSigns, so scanning every JSON file is safe.
    for f in round_dir.glob('*.json'):
        try:
            o = load(f)
        except Exception:
            continue
        stack = [o]
        while stack:
            x = stack.pop()
            if isinstance(x, dict):
                if 'visibleSigns' in x and 'acceptedDecisionCount' in x:
                    n = x['acceptedDecisionCount']
                    for s in x['visibleSigns']:
                        for sid in shelves:
                            if s.get('label') == labels.get(sid) and (sid not in seen or n < seen[sid]):
                                seen[sid] = n
                stack.extend(x.values())
            elif isinstance(x, list):
                stack.extend(x)
    return seen


def main():
    exp = pathlib.Path(sys.argv[1]).resolve()
    rounds = [exp / r for r in sys.argv[2:]] or sorted(p.parent for p in exp.glob('g*/r*/outcome.json'))
    for rd in rounds:
        g, r = rd.parent.name, rd.name
        wr = exp / 'supervisor' / f'{g}-{r}-world-reference.json'
        if not wr.exists():
            print(json.dumps({'round': f'{g}/{r}', 'error': 'no world reference'})); continue
        w = load(wr)
        out = load(rd / 'outcome.json')
        prod_shelf = {p['id']: sh['stationId'] for sh in w['shelves'] for p in sh['products']}
        labels = {}
        _, _, st = graph(w)
        for n in w['navigation']['states'][0]['nodes']:
            for s in n['nearbyStations']:
                labels[s['id']] = s['label']
        shelves = sorted({prod_shelf[pid] for pid in out['targetCart']})
        sp = shortest(w, shelves)
        walks = out.get('walks')
        fs = first_signs(rd, shelves, labels)
        print(json.dumps({'round': f'{g}/{r}', 'layout': w['world']['config']['layoutId'],
                          'construction': w['world']['config'].get('entranceConstruction'),
                          'success': out.get('success'), 'systemCheckout': out.get('systemCheckout'),
                          'steps': out.get('steps'), 'walks': walks, 'shortestWalks': sp,
                          'wastedWalks': None if sp is None or walks is None else walks - sp,
                          'firstTargetSign': min(fs.values()) if fs else None,
                          'firstSignByShelf': fs, 'shelvesNeverSeen': [s for s in shelves if s not in fs]},
                         ensure_ascii=False))


if __name__ == '__main__':
    main()
