'use strict';
// Development app pairing and real-time replay.
// Handler bodies were moved verbatim from server.cjs.
const { string, object, schema } = require('./schema.cjs');
const { readTrace } = require('./common.cjs');
const definitions = [
  { name: 'pair_app_session', description: 'Issue a five-minute, one-use pairing URL for one allowlisted local/staging test account. Open it in the development web app and log in with that account.', inputSchema: schema({ appOrigin: string, backendOrigin: string, memberId: string }, ['appOrigin', 'backendOrigin', 'memberId']) },
  { name: 'list_app_sessions', description: 'List authenticated development app tabs, mission readiness and per-tab replay status.', inputSchema: schema({}), annotations: { readOnlyHint: true } },
  { name: 'play_trace', description: 'Send a complete validated trace to one authenticated app tab for real-time replay through existing user inputs. One active replay per tab and test account.', inputSchema: schema({ tabId: string, trace: object, traceFilePath: string }, ['tabId']) },
  { name: 'replay_status', description: 'Read progress and smoothness measurements for a replay.', inputSchema: schema({ replayId: string, tabId: string }), annotations: { readOnlyHint: true } },
  { name: 'stop_replay', description: 'Stop replay on the selected tab and release its virtual input through the app.', inputSchema: schema({ tabId: string }, ['tabId']) },
];
async function invoke(name, args, ctx) {
  const { getBridge, ownerId } = ctx;
  const active = await getBridge();
  if (name === 'pair_app_session') return active.pair(args);
  if (name === 'list_app_sessions') return active.list();
  if (name === 'play_trace') return active.play(args.tabId, readTrace(args), ownerId);
  if (name === 'replay_status') return active.status(args);
  if (name === 'stop_replay') return active.stop(args.tabId, ownerId);
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
