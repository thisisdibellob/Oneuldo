// Explicit local maintenance tool. Dry run by default; only completed sessions.
// Uses the exact frontend reducer; historical analysis snapshots stay unchanged.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire, Module } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'frontend/package.json'));
const ts = require('typescript');
const modulePath = resolve(root, 'frontend/src/behavior/movementLogReducer.ts');
const compiled = ts.transpileModule(readFileSync(modulePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const reducerModule = new Module(modulePath);
reducerModule._compile(compiled, modulePath);
const { MovementLogReducer, MOVEMENT_SAMPLING } = reducerModule.exports;
const args = process.argv.slice(2), apply = args.includes('--apply');
const sessions = args.filter(a => a !== '--apply');
if (!sessions.length || sessions.some(s => !/^[0-9a-f-]{36}$/.test(s))) throw new Error('Pass explicit session UUIDs [--apply]');
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const sql = text => docker(['exec', '-i', 'oneuldo-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'oneuldo', '-d', 'oneuldo', '-At'], text);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const list = sessions.map(quote).join(',');
const original = JSON.parse(sql(`SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY session_id,event_sequence),'[]') FROM behavior_logs b WHERE session_id IN (${list});`));
const updated = [], stats = [];
for (const session of sessions) {
  const rows = original.filter(r => r.session_id === session);
  if (!rows.length || !rows.some(r => r.session_end_context)) throw new Error('Session missing or not completed: ' + session);
  if (rows.some((r, i) => r.event_sequence !== i + 1)) throw new Error('Original session has sequence gaps: ' + session);
  if (rows.some(r => r.payload?.marketContent?.movementReplay)) throw new Error('Session already replayed: ' + session);
  if (rows.some(r => ['SHOP.MOVEMENT_BLOCKED', 'SHOP.MOVEMENT_BLOCKED_REPEATEDLY'].includes(r.event_code))) {
    throw new Error('Legacy blocked episodes require separate reviewed reconstruction');
  }
  const annotate = (event, span) => ({ ...event, payload: { ...event.payload,
    marketContent: { ...event.payload.marketContent, movementSpan: span } } });
  const reducer = new MovementLogReducer(annotate);
  const kept = rows.flatMap(row => {
    const p = row.payload;
    const safe = row.event_code === 'SHOP.MOVEMENT_SAMPLED' && typeof p?.x === 'number' && typeof p?.y === 'number'
      && !row.first_action && !row.error_context && !row.support_context && !row.safety_context && !row.validity_context;
    return reducer.push(row, safe ? { time: Date.parse(row.occurred_at), x: p.x, y: p.y,
      blocked: p.blocked === true, controlMode: String(p.controlMode) } : null);
  });
  kept.push(...reducer.flush());
  const preserved = new Set(kept.map(r => r.id));
  if (rows.some(r => !preserved.has(r.id) && r.event_code !== 'SHOP.MOVEMENT_SAMPLED')) throw new Error('Non-movement event removed');
  // Verify every omitted point can be reconstructed within the declared error.
  for (let i = 0; i < rows.length; i++) {
    if (preserved.has(rows[i].id)) continue;
    let a = i - 1, b = i + 1;
    while (a >= 0 && !preserved.has(rows[a].id)) a--;
    while (b < rows.length && !preserved.has(rows[b].id)) b++;
    const left = rows[a], right = rows[b], p = rows[i];
    if (!left || !right || left.event_code !== 'SHOP.MOVEMENT_SAMPLED' || right.event_code !== 'SHOP.MOVEMENT_SAMPLED') throw new Error('Lost boundary');
    const dt = Date.parse(right.occurred_at) - Date.parse(left.occurred_at);
    const f = (Date.parse(p.occurred_at) - Date.parse(left.occurred_at)) / dt;
    const error = Math.hypot(p.payload.x - left.payload.x - (right.payload.x - left.payload.x) * f,
      p.payload.y - left.payload.y - (right.payload.y - left.payload.y) * f);
    if (dt > 1000 || error > 0.500001 || !Number.isFinite(error)) throw new Error('Replay error exceeded');
  }
  const summary = { session, before: rows.length, after: kept.length,
    movementBefore: rows.filter(r => r.event_code === 'SHOP.MOVEMENT_SAMPLED').length,
    movementAfter: kept.filter(r => r.event_code === 'SHOP.MOVEMENT_SAMPLED').length };
  stats.push(summary);
  kept.forEach((row, i) => {
    const payload = structuredClone(row.payload);
    if (row.event_code === 'SHOP.MOVEMENT_SAMPLED' || row.event_code === 'SHOP.SESSION_STARTED') {
      payload.marketContent ??= {};
      // Do not invent historical coordinate context that was not recorded.
      payload.marketContent.movementSampling = MOVEMENT_SAMPLING;
      if (payload.marketContent.movementContext) {
        Object.assign(payload.marketContent.movementContext, MOVEMENT_SAMPLING);
        delete payload.marketContent.movementContext.intervalMs;
        delete payload.marketContent.movementContext.distanceThreshold;
      }
      if (row.event_code === 'SHOP.SESSION_STARTED') payload.marketContent.movementReplay = {
        version: MOVEMENT_SAMPLING.samplingVersion, source: 'stored-v1-samples', ...summary,
      };
    }
    updated.push({ id: row.id, event_sequence: i + 1, step_order: i + 1, payload });
  });
}
const directory = resolve(root, '.tools/movement-replay', new Date().toISOString().replaceAll(/[:.]/g, '-'));
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'original-logs.json'), JSON.stringify(original));
writeFileSync(resolve(directory, 'replayed-logs.json'), JSON.stringify(updated));
writeFileSync(resolve(directory, 'report.json'), JSON.stringify(stats, null, 2));
const transaction = `BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE behavior_logs IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE replay_original AS SELECT * FROM jsonb_populate_recordset(NULL::behavior_logs, ${quote(JSON.stringify(original))}::jsonb);
CREATE TEMP TABLE replay_kept AS SELECT * FROM jsonb_to_recordset(${quote(JSON.stringify(updated))}::jsonb) AS x(id uuid,event_sequence bigint,step_order integer,payload jsonb);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM behavior_logs b FULL JOIN replay_original o ON b.id=o.id WHERE (b.session_id IN (${list}) OR o.id IS NOT NULL) AND to_jsonb(b) IS DISTINCT FROM to_jsonb(o)) THEN
  RAISE EXCEPTION 'Session changed since preview';
 END IF;
END $$;
DELETE FROM behavior_logs WHERE session_id IN (${list}) AND id NOT IN (SELECT id FROM replay_kept);
UPDATE behavior_logs SET event_sequence=event_sequence+1000000000 WHERE session_id IN (${list});
UPDATE behavior_logs b SET event_sequence=k.event_sequence,step_order=k.step_order,payload=k.payload FROM replay_kept k WHERE b.id=k.id;
UPDATE behavior_session_integrity s SET highest_event_sequence=q.n,received_event_count=q.n,missing_event_count=0,
 missing_event_sequences='[]',status='COMPLETE',finalized=true,evaluated_at=now()
 FROM (SELECT session_id,count(*) AS n FROM behavior_logs WHERE session_id IN (${list}) GROUP BY session_id) q WHERE s.session_id=q.session_id;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM behavior_logs b JOIN replay_kept k ON b.id=k.id WHERE b.event_sequence<>k.event_sequence OR b.payload IS DISTINCT FROM k.payload)
 OR (SELECT count(*) FROM behavior_logs WHERE session_id IN (${list}))<>(SELECT count(*) FROM replay_kept) THEN RAISE EXCEPTION 'Replay verification failed'; END IF;
END $$;
COMMIT;`;
writeFileSync(resolve(directory, 'apply.sql'), transaction);
if (apply) {
  // Backup all dependent links, normalization and historical snapshots before cascades.
  const backup = '/tmp/oneuldo-before-movement-replay.dump';
  docker(['exec', 'oneuldo-postgres', 'pg_dump', '-U', 'oneuldo', '-d', 'oneuldo', '-Fc', '-f', backup]);
  docker(['cp', 'oneuldo-postgres:' + backup, resolve(directory, 'database.dump')]);
  sql(transaction);
}
console.log(JSON.stringify({ applied: apply, directory, stats }, null, 2));
