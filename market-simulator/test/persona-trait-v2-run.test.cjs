'use strict';
require('../runtime.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const run = require('../src/personaValidationRun.cjs');
const { summarizeTraitFindings } = require('../src/personaTraitValidationRun.cjs');
const { createMarketSession } = require('../../frontend/src/game/marketSession.ts');
const { createMarketReplaySnapshot } = require('../../frontend/src/game/marketReplayTrace.ts');
const spec = require('../validation/persona-trait-validation-spec-v2.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const axes = ['initialCaution','operationLearning','routeReliance','textCueLoad'];
const slugs = ['caution','operation','route','text'];
const products = [{id:'milk',name:'흰 우유',detail:'1 L'},{id:'milk-small',name:'흰 우유',detail:'200 mL'}];
function evidence(axis, high) {
  const open = {type:'openShelf',stationId:'fresh'}, add = {type:'dragProduct',productId:'milk',quantity:1,gesture:{outcome:'drop'}};
  let rows, bundle;
  if (axis === 'initialCaution') rows = [...(high ? [{type:'lookAround'},{type:'pause'}] : []),open];
  if (axis === 'operationLearning') rows = [open,...(high ? [{type:'lookAround'}] : []),add];
  if (axis === 'textCueLoad') rows = [open,...(high ? [{type:'lookAround',before:{products}}] : []),{...add,before:{products}}];
  if (axis === 'routeReliance') {
    const menus = {start:['A','B'],WA:['B','C'],WB:['A','C']};
    rows = [['start','A'],['WA','B'],['WB',high?'A':'C']].map(([location,id]) => ({type:'walkToAnchor',target:{anchorId:id},
      before:{phase:'shopping',view:'world',activeStation:null,anchors:menus[location].map(id=>({id}))},
      choiceResolution:{source:{location,navigationStateId:'state'}}}));
    bundle = {worldReference:{waypoints:['A','B','C'].map(id=>({waypointId:`W${id}`,anchorId:id}))},
      choiceCatalog:{navigation:[{navigationStateId:'state',locations:Object.entries(menus).map(([location,ids])=>({location,choiceIds:ids.map(id=>`walk/W${id}`)}))}]}};
  }
  const steps = rows.map(({before,choiceResolution,...step},index)=>({id:`s${index}`,attentionTag:'task',...step}));
  const decisions = rows.map((row,index)=>({decisionIndex:index,before:{sequence:index,...row.before},after:{result:{accepted:true}},
    action:row.type==='openShelf'?{type:'interact',station:row.stationId}:row.type==='dragProduct'?{type:'add',productId:'milk',quantity:1}
      :row.type==='walkToAnchor'?{type:'walkToAnchor',anchorId:row.target.anchorId}:{type:row.type},choiceResolution:row.choiceResolution}));
  return {steps,audit:{decisions},bundle};
}
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'oneuldo-first-play-run-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const snapshotFilePaths = {};
  const goals = ['milk','apple','water','banana','eggs'].map((productId,index)=>({productId,quantity:index===2?2:1}));
  for (const [condition,n] of [['low',2],['high',5]]) {
    const snapshot = createMarketReplaySnapshot(createMarketSession({seed:`v2-${condition}`,difficulty:'exact',objectives:goals.slice(0,n)}));
    snapshotFilePaths[condition] = path.join(directory,`${condition}.json`); write(snapshotFilePaths[condition],snapshot);
  }
  const profiles = axes.flatMap((key,index)=>['low','high'].map(level=>({id:`${slugs[index]}-${level}`,basePersonaId:'mild-intellectual-disability-adult',traits:{[key]:level}})));
  return {runId:'first-play-fixture',outputDirectory:directory,snapshotFilePaths,profiles,seeds:Array.from({length:8},(_,i)=>`s${i}`)};
}
test('v2 saved-run pipeline exposes four behavioral verdicts, nine axes, coverage and diagnostic-only variance', t => {
  const args = setup(t), prepared = run.prepare(args), manifest = read(prepared.manifestPath);
  assert.equal(manifest.analysisVersion,2); assert.equal(manifest.catalogSchemaVersion,'persona-traits-v2');
  assert.equal(prepared.catalog.traits.length,9);
  assert.equal(run.checkReadiness({runDirectory:prepared.runDirectory}).expectedValidPairs.length,8);
  for (const slot of prepared.slots) {
    const [slug,level] = slot.personaId.split('-'), axis = axes[slugs.indexOf(slug)], fixture = evidence(axis,level==='high');
    fs.mkdirSync(path.dirname(slot.tracePath),{recursive:true});
    write(slot.tracePath,{traceSchemaVersion:'2',traceId:`fixture-${slot.personaId}-${slot.condition}-${slot.seed}`,generationPolicy:'stochastic',experienceMode:'first-play',
      personaId:slot.personaId,personaVersion:slot.personaVersion,seed:slot.seed,target:{snapshotId:slot.snapshotId},steps:fixture.steps});
    write(`${slot.tracePath}.knowledge-audit.json`,fixture.audit);
    if (fixture.bundle) { fs.mkdirSync(`${slot.tracePath}.whole-trace`); write(`${slot.tracePath}.whole-trace/bundle.json`,fixture.bundle); }
  }
  const measured = run.measure({runDirectory:prepared.runDirectory,allowFixture:true}), data = read(measured.measurementsPath);
  assert.equal(data.completed,128); assert.equal(data.findings.length,8);
  assert.ok(data.findings.every(row=>row.pairs===8&&row.delta===1&&row.status==='pass'&&row.evidenceType==='observed-action'));
  const paths = run.report({runDirectory:prepared.runDirectory}), report = read(paths.reportPath), markdown = fs.readFileSync(paths.markdownPath,'utf8');
  assert.equal(Object.keys(report.axes.traitExpression).length,9);
  for (const axis of axes) {
    assert.equal(report.axes.traitExpression[axis].status,'supported');
    const kind = spec.metrics.find(row=>row.traitKey===axis).kind;
    assert.ok(report.axes.coverage.every(row=>Object.hasOwn(row,kind)));
    assert.match(markdown,new RegExp(kind));
  }
  const warnings = Object.values(report.flags).flatMap(row=>row.diagnosticWarnings).filter(row=>row.code==='zero-first-play-trait-variance');
  assert.ok(warnings.length>=16);
  assert.ok(warnings.every(row=>row.descriptiveOnly&&row.usedForPrimaryDecision===false&&row.traces.length===8&&row.traces.every(trace=>trace.stepIds.length)));
  assert.ok(report.limitations.includes('연구 근거로 설계한 첫 플레이 성향이 수준대로 행동에 나타나는지를 본 것이며, 실제 지적장애인과의 유사성을 입증하지 않는다.'));
  assert.match(markdown,/missing-saved-navigation-menu-or-choice-source|no-visited-and-unvisited-walk-options/);
  const blind = run.prepareBlind({runDirectory:prepared.runDirectory,allowFixture:true});
  assert.equal(Object.keys(blind.answerFormat.traits).length,9);
});
test('new spec retains every original metric and threshold and mixed first-play evidence is partial', () => {
  const old = require('../validation/persona-trait-validation-spec.json');
  assert.deepEqual(spec.metrics.slice(0,old.metrics.length),old.metrics);
  for (const key of ['minValidPairs','minAbsDelta','bootstrapReplicates','patterns','comparisonPolicy','maxFlaggedTraceRate']) assert.deepEqual(spec[key],old[key]);
  const findings = [{evidenceType:'observed-action',status:'pass'},{evidenceType:'observed-action',status:'inconclusive'}];
  assert.equal(summarizeTraitFindings(findings,{firstPlay:true}).status,'partial');
  assert.equal(summarizeTraitFindings(findings).status,'inconclusive');
});

const crypto = require('node:crypto');
const { canonicalMarketReplayJson } = require('../../frontend/src/game/marketReplayTrace.ts');
const { assertSpec } = require('../src/personaValidationSpec.cjs');
const specV3 = require('../validation/persona-trait-validation-spec-v3.json');
const digest = value => crypto.createHash('sha256').update(canonicalMarketReplayJson(value)).digest('hex');
function writeFixtureTraces(prepared) {
  for (const slot of prepared.slots) {
    const [slug,level] = slot.personaId.split('-'), fixture = evidence(axes[slugs.indexOf(slug)],level==='high');
    fs.mkdirSync(path.dirname(slot.tracePath),{recursive:true});
    write(slot.tracePath,{traceSchemaVersion:'2',traceId:`fixture-${slot.personaId}-${slot.condition}-${slot.seed}`,generationPolicy:'stochastic',experienceMode:'first-play',
      personaId:slot.personaId,personaVersion:slot.personaVersion,seed:slot.seed,target:{snapshotId:slot.snapshotId},steps:fixture.steps});
    write(`${slot.tracePath}.knowledge-audit.json`,fixture.audit);
    if (fixture.bundle) { fs.mkdirSync(`${slot.tracePath}.whole-trace`); write(`${slot.tracePath}.whole-trace/bundle.json`,fixture.bundle); }
  }
}
function normalized(value, directory) {
  if (typeof value === 'string') return value.replaceAll(directory,'<DIR>');
  if (Array.isArray(value)) return value.map(item=>normalized(item,directory));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key])=>!['dataFingerprint','specHash','specVersion','opportunityRows','positionStability','baselineComparison'].includes(key)).map(([key,item])=>[key,normalized(item,directory)]));
  return value;
}
test('v3 spec copies v2 and only adds positionSplit plus descriptive baseline and position-stability blocks', () => {
  const split = ['comparisonRate','postSelectionListRate','interestDetourRate','persistenceResponseRate','helpSeekingRate','operationLearningRate','routeRelianceRate','textCueLoadRate'];
  assert.equal(specV3.version,spec.version+1); assert.equal(specV3.analysisVersion,spec.analysisVersion);
  assert.deepEqual(specV3.metrics.map(({positionSplit,...metric})=>metric),spec.metrics);
  assert.deepEqual(specV3.metrics.filter(m=>m.positionSplit).map(m=>m.kind).sort(),[...split].sort());
  assert.deepEqual(specV3.metrics.filter(m=>!m.positionSplit).map(m=>m.kind).sort(),['initialCautionCount','newShelfDelayMs','preCheckoutCartRate']);
  const {approximateRule,positionRule,interpretation,...baselineKeys} = specV3.baselineComparison;
  assert.deepEqual(baselineKeys,{enabled:true,traitMode:'omitted',descriptiveOnly:true});
  assert.match(approximateRule,/95% 구간이 0을 포함/);
  assert.deepEqual(Object.keys(positionRule),['high-only-shift','low-only-shift','both-shift','baseline-beyond-range','indistinguishable']);
  assert.deepEqual(specV3.positionStability,{enabled:true,split:'opportunity-order-halves',oddMiddle:'early',minOpportunitiesPerTrace:2,descriptiveOnly:true});
  const { version, note, metrics, baselineComparison, positionStability, ...rest } = specV3;
  const { version: v2Version, note: v2Note, metrics: v2Metrics, ...v2Rest } = spec;
  assert.deepEqual(rest,v2Rest); assert.ok(note.startsWith(v2Note));
});
test('new runs use v3 with opportunityRows while saved v2 manifests stay v2 with unchanged measurements', t => {
  const v3Args = setup(t), v3 = run.prepare(v3Args), v3Manifest = read(v3.manifestPath);
  assert.equal(v3Manifest.specHash,digest(specV3)); assert.equal(v3Manifest.specVersion,specV3.version); assert.equal(v3Manifest.analysisVersion,2);
  assert.equal(assertSpec(v3Manifest,null,'traits'),require('../validation/persona-trait-validation-spec-v3.json'));
  const v2Args = setup(t), v2 = run.prepare(v2Args), v2Manifest = read(v2.manifestPath);
  // A manifest saved before v3 existed: same layout, v2 spec identity.
  Object.assign(v2Manifest,{specHash:digest(spec),specVersion:spec.version}); write(v2.manifestPath,v2Manifest);
  assert.equal(assertSpec(v2Manifest,null,'traits'),spec);
  writeFixtureTraces(v3); writeFixtureTraces(v2);
  const v3Data = read(run.measure({runDirectory:v3.runDirectory,allowFixture:true}).measurementsPath);
  const v2Data = read(run.measure({runDirectory:v2.runDirectory,allowFixture:true}).measurementsPath);
  assert.equal(read(v2.manifestPath).specHash,digest(spec),'v2 manifest keeps its spec');
  assert.equal(v2Data.specHash,digest(spec)); assert.equal(v2Data.specVersion,spec.version);
  assert.ok(!JSON.stringify(v2Data).includes('opportunityRows'),'v2 measurements gain no opportunityRows');
  const rated = v3Data.perTrace.flatMap(row=>Object.values(row.metrics)).filter(m=>Array.isArray(m.opportunityRows));
  assert.ok(rated.length>0 && rated.every(m=>m.opportunityRows.length===m.denominator&&m.opportunityRows.filter(r=>r.hit).length===m.numerator));
  assert.deepEqual(normalized(v3Data,v3Args.outputDirectory),normalized(v2Data,v2Args.outputDirectory));
  for (const data of [v2Data,v3Data]) assert.ok(data.findings.every(row=>row.pairs===8&&row.delta===1&&row.status==='pass'));
});
