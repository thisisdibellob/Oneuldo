#!/usr/bin/env node
'use strict';
// Builds the actor-facing copy of a prepared whole-trace request for the
// decision-by-decision authoring mode. The owner keeps the full bundle; only
// the copy handed to the actor drops the hidden world reference, the full
// choice catalog and source paths, and rewrites the few directives that told
// the actor to use them. Identity fields (requestId, inputHash, authoringGuide
// identity) are never changed. The one-shot submit path must not use this copy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'authoring-actor-input-v1';
const OMITTED_BUNDLE_KEYS = Object.freeze(['worldReference', 'choiceCatalog', 'sourceFiles']);
const OMITTED_TOP_LEVEL_KEYS = Object.freeze(['diagnosticDirectory']);
const AUTHORING_CHECKOUT = 'In authoring mode use only the canonical checkout/<checkoutId> shown in the current menu; reference aliases are not offered to the actor.';

// Each entry replaces an exact directive that pointed the actor at an omitted
// key. Prohibitions such as "never supplied from worldReference" stay as they
// are: they remain true when the key is absent.
const REPLACEMENTS = Object.freeze([
  { id: 'walk-from-menu',
    from: 'Choose walk/<waypointId> from choiceCatalog.navigation at your current location in the matching navigation state. Start at state.start; after a walk use that waypoint node.',
    to: 'Choose walk/<waypointId> only from the current authoring menu (choiceIds and visibleWalkChoices); the menu already reflects your current location and navigation state.' },
  { id: 'checkout-alias-contract',
    from: 'An explicit choiceCatalog.referenceAliases entry {aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"} permits only open/<checkoutId> -> checkout/<same checkoutId>, with an exact current source, an actual checkout target and a currently available canonical button. Bundles without that entry keep strict ID matching.',
    to: AUTHORING_CHECKOUT },
  { id: 'checkout-alias-guide',
    from: 'Only an explicit choiceCatalog.referenceAliases entry {aliasChoiceId,canonicalChoiceId,kind:"checkout-open-v1"} permits open/<checkoutId> to resolve to checkout/<the same checkoutId>. The target must be an actual checkout and its canonical control must be available in the exact current source. A bundle without this entry keeps strict ID matching.',
    to: AUTHORING_CHECKOUT },
  { id: 'world-reference-purpose',
    from: '전체 행동을 한 번 제출하되, worldReference는 세계가 어떻게 반응하고 무엇을 화면에 표시하는지 재현하기 위한 참고 자료다. 그 안의 숨은 배치·재고·목표·정답은 인물이 이미 아는 사실이 아니다.',
    to: '결정은 작성 보조 모드에서 하나씩 제출한다. 세계 참고 자료(worldReference)와 전체 선택지 목록(choiceCatalog)은 이 배우 입력에서 제외됐으며, 각 결정 뒤에 받는 현재 화면(currentObservation)과 선택지 메뉴만 사용한다.' },
  { id: 'navigation-table',
    from: 'navigation은 현재 화면의 합법 이동 관계를 확인하는 참고 표다. 초기상태 start에서 시작하고 걷기마다 현재 waypoint를 갱신한다. 현재 allowedWaypointIds에서',
    to: '이동은 현재 메뉴의 allowedWaypointIds·visibleWalkChoices에서' },
  { id: 'full-reference-disclaimer-ko',
    from: '모델에는 전체 참고 자료가 제공되므로 이는 역할 지식 분리와 선언한 단서 검증이며 강한 정보 차단 보장은 아니다.',
    to: '배우 입력에서 전체 참고 자료를 제외했지만, 이는 입력 범위 제한과 선언한 단서 검증이며 모델 내부 판단을 입증하지는 않는다.' },
  { id: 'one-shot-submit',
    from: 'candidateVersion:"7",requestId,decisions만 있는 JSON 객체로 전체 계획을 제출한다.',
    to: '모든 결정이 수락된 뒤 finish_and_submit_whole_trace(또는 finish_whole_trace_authoring 후 제출)로 한 번에 제출한다.' },
  { id: 'full-reference-disclaimer-en',
    from: 'A full worldReference in the same model context cannot guarantee that hidden information had no influence.',
    to: 'worldReference and choiceCatalog are excluded from this actor input; declared-cue audits still do not prove the model\'s internal reasoning.' },
]);

// Directive fragments that must not survive in the actor copy.
const FORBIDDEN_DIRECTIVES = Object.freeze(REPLACEMENTS.map(entry => entry.from));

const NOTICE = '이 파일은 작성 보조 모드용 배우 입력이다. worldReference·choiceCatalog·sourceFiles는 제외됐다. 아래 문서에 이 이름이 나오면 "그 정보로 판단하지 말라"는 뜻으로만 읽는다. 위치·선택지·화면은 begin과 매 결정 뒤에 받는 메뉴(choiceIds, visibleWalkChoices)와 currentObservation에서만 얻는다. This actor input omits worldReference, choiceCatalog and sourceFiles; use only the current menu and currentObservation.';

function rewriteStrings(value, counts) {
  if (typeof value === 'string') {
    let text = value;
    for (const entry of REPLACEMENTS) {
      if (!text.includes(entry.from)) continue;
      const parts = text.split(entry.from);
      counts[entry.id] = (counts[entry.id] ?? 0) + parts.length - 1;
      text = parts.join(entry.to);
    }
    return text;
  }
  if (Array.isArray(value)) return value.map(item => rewriteStrings(item, counts));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteStrings(item, counts)]));
  }
  return value;
}

function findStrings(value, predicate, at = '', found = []) {
  if (typeof value === 'string') { if (predicate(value)) found.push(at || '.'); }
  else if (Array.isArray(value)) value.forEach((item, index) => findStrings(item, predicate, `${at}[${index}]`, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) findStrings(item, predicate, `${at}.${key}`, found);
  }
  return found;
}

function buildActorInput(prepareResponse) {
  if (!prepareResponse || typeof prepareResponse !== 'object') throw new TypeError('prepare response must be an object');
  const { requestId, bundle } = prepareResponse;
  if (typeof requestId !== 'string' || !requestId) throw new TypeError('prepare response requires requestId');
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new TypeError('prepare response requires bundle');
  if (bundle.requestId !== undefined && bundle.requestId !== requestId) throw new Error('bundle.requestId does not match requestId');
  const kept = Object.fromEntries(Object.entries(bundle).filter(([key]) => !OMITTED_BUNDLE_KEYS.includes(key)));
  const counts = {};
  const projected = rewriteStrings(kept, counts);
  const leftover = findStrings(projected, text => FORBIDDEN_DIRECTIVES.some(fragment => text.includes(fragment)));
  if (leftover.length) throw new Error(`Directives to omitted keys remain at ${leftover.join(', ')}`);
  return {
    requestId,
    actorInputProjection: {
      version: VERSION,
      notice: NOTICE,
      omittedBundleKeys: OMITTED_BUNDLE_KEYS.filter(key => Object.hasOwn(bundle, key)),
      omittedTopLevelKeys: OMITTED_TOP_LEVEL_KEYS.filter(key => Object.hasOwn(prepareResponse, key)),
      replacements: REPLACEMENTS.map(entry => ({ id: entry.id, count: counts[entry.id] ?? 0 })),
    },
    bundle: projected,
  };
}

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

// Fixed actor instruction templates. A new wording is a new file and id; an
// existing template is never edited, so recorded SHAs keep identifying it.
const INSTRUCTION_TEMPLATES = Object.freeze({
  'authoring-v1': path.join(__dirname, 'actor-instructions', 'legacy', 'authoring-v1.txt'),
  'authoring-v2': path.join(__dirname, 'actor-instructions', 'legacy', 'authoring-v2.txt'),
  'authoring-v3': path.join(__dirname, 'actor-instructions', 'authoring-v3.txt'),
  'authoring-v6': path.join(__dirname, 'actor-instructions', 'authoring-v6.txt'),
  'authoring-v6-h200': path.join(__dirname, 'actor-instructions', 'authoring-v6-h200.txt'),
  'authoring-v5': path.join(__dirname, 'actor-instructions', 'authoring-v5.txt'),
  'authoring-v5-h200': path.join(__dirname, 'actor-instructions', 'authoring-v5-h200.txt'),
  'authoring-v4': path.join(__dirname, 'actor-instructions', 'authoring-v4.txt'),
  'authoring-v4-h200': path.join(__dirname, 'actor-instructions', 'authoring-v4-h200.txt'),
  // Identical to authoring-v3 except the explicit 200-decision horizon (prepare actionHorizon:200).
  'authoring-v3-h200': path.join(__dirname, 'actor-instructions', 'authoring-v3-h200.txt'),
});
const DEFAULT_INSTRUCTION_TEMPLATE = 'authoring-v3';
const MAILBOX_CLI = path.join(__dirname, 'whole-trace-mailbox.cjs');

function renderActorInstructions(templateId, slotDirectory) {
  const templateFile = INSTRUCTION_TEMPLATES[templateId];
  if (!templateFile) throw new Error(`Unknown actor instruction template: ${templateId}`);
  if (!path.isAbsolute(slotDirectory)) throw new Error('slotDirectory must be absolute');
  const template = fs.readFileSync(templateFile, 'utf8');
  const text = template.split('__SLOT_DIRECTORY__').join(slotDirectory).split('__MAILBOX_CLI__').join(MAILBOX_CLI);
  if (/__[A-Z_]+__/.test(text)) throw new Error(`Unfilled placeholder remains in ${templateId}`);
  return { templateId, templateFile, templateSha256: sha256(template), text };
}

function writeActorInput(prepareResponseFile, outputFile, options = {}) {
  const sourceText = fs.readFileSync(prepareResponseFile, 'utf8');
  const actorInput = buildActorInput(JSON.parse(sourceText));
  const outputText = JSON.stringify(actorInput, null, 2) + '\n';
  const slotDirectory = path.dirname(path.resolve(outputFile));
  let instructions = null;
  if (options.instructions !== false) {
    // The template addresses the owner as <slot>/owner and the input as
    // <slot>/actor-input.json, so refuse layouts it would describe wrongly.
    if (path.basename(outputFile) !== 'actor-input.json') throw new Error('actor input must be named actor-input.json for the instruction template');
    if (!fs.existsSync(path.join(slotDirectory, 'owner'))) throw new Error(`Owner directory not found at ${path.join(slotDirectory, 'owner')}`);
    // The instruction text names the decision horizon, so it must match the prepared bundle.
    const horizon = actorInput.bundle.generationLimits?.acceptedActionHorizon ?? 100;
    const templateId = options.template ?? (horizon === 200 ? 'authoring-v3-h200' : DEFAULT_INSTRUCTION_TEMPLATE);
    if (templateId.endsWith('-h200') !== (horizon === 200))
      throw new Error(`Instruction template ${templateId} does not match the prepared ${horizon}-decision horizon`);
    instructions = renderActorInstructions(templateId, slotDirectory);
    instructions.file = path.join(slotDirectory, 'actor-instructions.txt');
    if (fs.existsSync(instructions.file)) throw new Error(`Refusing to overwrite ${instructions.file}`);
  }
  fs.mkdirSync(slotDirectory, { recursive: true });
  fs.writeFileSync(outputFile, outputText, { flag: 'wx' });
  if (instructions) fs.writeFileSync(instructions.file, instructions.text, { flag: 'wx' });
  return {
    version: VERSION,
    requestId: actorInput.requestId,
    inputHash: actorInput.bundle.inputHash ?? null,
    prepareResponseFile: path.resolve(prepareResponseFile),
    prepareResponseSha256: sha256(sourceText),
    actorInputFile: path.resolve(outputFile),
    actorInputSha256: sha256(outputText),
    actorInputBytes: Buffer.byteLength(outputText),
    omittedBundleKeys: actorInput.actorInputProjection.omittedBundleKeys,
    omittedTopLevelKeys: actorInput.actorInputProjection.omittedTopLevelKeys,
    replacements: actorInput.actorInputProjection.replacements,
    actorInstructions: instructions && {
      templateId: instructions.templateId,
      templateFile: instructions.templateFile,
      templateSha256: instructions.templateSha256,
      file: instructions.file,
      sha256: sha256(instructions.text),
    },
  };
}

module.exports = { VERSION, OMITTED_BUNDLE_KEYS, OMITTED_TOP_LEVEL_KEYS, REPLACEMENTS, INSTRUCTION_TEMPLATES,
  DEFAULT_INSTRUCTION_TEMPLATE, buildActorInput, renderActorInstructions, writeActorInput };

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--template') options.template = args[++index];
    else if (args[index] === '--no-instructions') options.instructions = false;
    else positional.push(args[index]);
  }
  const [input, output] = positional;
  if (!input || !output) {
    process.stderr.write('Usage: node market-simulator/whole-trace-actor-input.cjs <slot>/owner/prepare-response.json <slot>/actor-input.json [--template authoring-v3] [--no-instructions]\nWrites <slot>/actor-input.json and <slot>/actor-instructions.txt (never overwrites) and prints a provenance summary.\n');
    process.exitCode = 2;
  } else {
    try { process.stdout.write(JSON.stringify(writeActorInput(input, output, options), null, 2) + '\n'); }
    catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  }
}
