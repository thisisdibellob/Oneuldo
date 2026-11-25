#!/usr/bin/env node
'use strict';
// Persona-authored visit memos: formats, shape checks, per-persona memo
// profiles, the store key that decides which memos chain together, and
// reading a visit memo chain. Code never summarises, corrects, trims or fills
// a memo; it only checks shape and carries the person's own words verbatim.
// Design: docs/ai/visit-memo-v2-design-2026-11-24.md

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

// A persona-authored memo from a previous visit. It is the actor's own words,
// carried verbatim; code never summarises, corrects or adds to it.
const PREVIOUS_VISIT_VERSION = 'previous-visit-memo-v1';
const VISIT_MEMO_MAX_CHARACTERS = 300;
const PREVIOUS_VISIT_NOTICE = 'previousVisit.memo는 이 인물이 지난번 같은 마트에 왔을 때 마지막에 자기 말로 남긴 기억 메모다. 인물은 이 마트에 한 번 와 봤다는 것을 안다. 메모는 인물의 기억이라 틀리거나 흐리거나 빠진 것이 있을 수 있다. 장보기 목록은 새로 읽어야 하며 지난번과 다를 수 있다. 메모를 얼마나 믿고 쓸지는 인물이 현재 화면과 대조해 정한다. 메모에 적힌 매대·계산대도 걸어서 현재 화면에 보이고 가까워져야 열 수 있으며, 메모는 cueRef가 아니다.';
const VISIT_MEMO_TAG = /^<visit-memo>\s*$([\s\S]*?)^<\/visit-memo>\s*$|<visit-memo>([\s\S]*?)<\/visit-memo>/gm;

// v2: the persona fills fixed sections in its own words and rewrites the memo
// on every visit (docs/ai/visit-memo-v2-design-2026-11-24.md). Code checks only
// the shape; it never fills, reorders, trims or judges the content.
const PREVIOUS_VISIT_V2_VERSION = 'previous-visit-memo-v2';
const VISIT_MEMO_V2_MAX_CHARACTERS = 500;
const VISIT_MEMO_V2_SECTIONS = Object.freeze([
  Object.freeze({ id: 'routine', header: '[장보기 순서]', maxItems: null }),
  Object.freeze({ id: 'scenes', header: '[기억나는 장면]', maxItems: 3 }),
  Object.freeze({ id: 'places', header: '[장소와 길]', maxItems: null }),
  Object.freeze({ id: 'nextTime', header: '[다음엔]', maxItems: 2 }),
  Object.freeze({ id: 'anyStore', header: '[어느 마트에서나]', maxItems: null }),
]);
const PREVIOUS_VISIT_V2_NOTICE = 'previousVisit.memo는 이 인물이 지난번 같은 마트 방문을 마치며 자기 말로 다시 쓴 기억 메모이고, 그 전 방문들에서 아직 기억하는 것도 합쳐져 있다. 인물은 이 마트에 와 본 적이 있다는 것을 안다. 칸은 [장보기 순서], [기억나는 장면], [장소와 길], [다음엔], [어느 마트에서나]이며, 기억나지 않아 비었거나 빠진 칸이 있을 수 있다. (확실)·(흐릿)은 인물 자신의 느낌이고 확실이라고 적힌 것도 틀릴 수 있다. 장보기 목록은 새로 읽어야 하며 지난번과 다를 수 있다. 메모를 얼마나 믿고 [다음엔]의 계획을 따를지는 인물이 현재 화면과 대조해 정한다. 메모에 적힌 매대·계산대도 걸어서 현재 화면에 보이고 가까워져야 열 수 있으며, 메모는 cueRef가 아니다.';

// v3 adds [들어가는 길] (the route from the start, in the menu's own direction
// words) and 〈label〉 tags: an exact on-screen name the person copied. When the
// same name is on screen again, the menu shows that memo line (recognition).
// Code only compares strings; it never decides relevance or a route.
const PREVIOUS_VISIT_V3_VERSION = 'previous-visit-memo-v3';
const VISIT_MEMO_V3_MAX_CHARACTERS = 600;
const VISIT_MEMO_V3_SECTIONS = Object.freeze([
  VISIT_MEMO_V2_SECTIONS[0],
  Object.freeze({ id: 'entryRoute', header: '[들어가는 길]', maxItems: null }),
  ...VISIT_MEMO_V2_SECTIONS.slice(1),
]);
const PREVIOUS_VISIT_V3_NOTICE = 'previousVisit.memo는 이 인물이 지난번 같은 마트 방문을 마치며 자기 말로 다시 쓴 기억 메모이고, 그 전 방문들에서 아직 기억하는 것도 합쳐져 있다. 인물은 이 마트에 와 본 적이 있다는 것을 안다. 칸은 [장보기 순서], [들어가는 길], [기억나는 장면], [장소와 길], [다음엔], [어느 마트에서나]이며, 기억나지 않아 비었거나 빠진 칸이 있을 수 있다. [들어가는 길]은 출발점에서 걸은 순서를 메뉴와 같은 방향 말로 적은 것이다. 〈〉 안의 말은 그때 화면에 보였던 이름을 그대로 옮긴 것이다. (확실)·(흐릿)은 인물 자신의 느낌이고 확실이라고 적힌 것도 틀릴 수 있다. 장보기 목록은 새로 읽어야 하며 지난번과 다를 수 있다. 메모를 얼마나 믿고 따를지는 인물이 현재 화면과 대조해 정한다. 메모에 적힌 매대·계산대도 걸어서 현재 화면에 보이고 가까워져야 열 수 있으며, 메모는 cueRef가 아니다.';
const MEMO_LABEL = /〈([^〈〉\n]*)〉/g;
const MEMO_LABEL_MAX_CHARACTERS = 40;

// Which memo format each memo template reads and writes.
const MEMO_FORMATS = Object.freeze({
  'authoring-v5-h200-memo': Object.freeze({ version: PREVIOUS_VISIT_VERSION, maxCharacters: VISIT_MEMO_MAX_CHARACTERS, notice: PREVIOUS_VISIT_NOTICE, sections: null }),
  'authoring-v5-h200-memo-v2': Object.freeze({ version: PREVIOUS_VISIT_V2_VERSION, maxCharacters: VISIT_MEMO_V2_MAX_CHARACTERS, notice: PREVIOUS_VISIT_V2_NOTICE, sections: VISIT_MEMO_V2_SECTIONS, labels: false }),
  'authoring-v5-h200-memo-v3': Object.freeze({ version: PREVIOUS_VISIT_V3_VERSION, maxCharacters: VISIT_MEMO_V3_MAX_CHARACTERS, notice: PREVIOUS_VISIT_V3_NOTICE, sections: VISIT_MEMO_V3_SECTIONS, labels: true }),
  // Same memo format as v3; the template adds the length check and the memo rewrite request.
  'authoring-v5-h200-memo-v3b': Object.freeze({ version: PREVIOUS_VISIT_V3_VERSION, maxCharacters: VISIT_MEMO_V3_MAX_CHARACTERS, notice: PREVIOUS_VISIT_V3_NOTICE, sections: VISIT_MEMO_V3_SECTIONS, labels: true, rewrites: 2 }),
});

// When a finished visit's memo is missing or fails the shape check, the
// supervisor may send this fixed request to the SAME actor session, at most
// format.rewrites times. Only the memo is rewritten; the visit is over.
const MEMO_REWRITE_VERSION = 'visit-memo-rewrite-v1';

function memoRewritePrompt(problem, format) {
  return [
    `방문 메모가 기록되지 않았습니다. 이유: ${problem}`,
    '장보기는 이미 끝났습니다. 행동을 다시 하거나 mailbox를 호출하거나 파일을 만들지 마세요.',
    '방금 쓴 메모를 같은 규칙으로 다시 써서, 최종 답에 <visit-memo> 줄과 </visit-memo> 줄 사이에만 넣으세요.',
    '이번 방문과 지난 메모에 이미 있던 것만 쓰고 새 정보를 더하지 마세요. 줄여야 하면 이 인물이 덜 중요하게 여기는 것부터 놓아 줍니다.',
    `칸 머리글을 포함해 ${format.maxCharacters}자 이하, 칸 순서와 머리글은 지침 그대로, 〈 〉는 짝을 맞춥니다.`,
  ].join('\n');
}

/** The memo format of a chain or template; throws for a template without sectioned memos. */
function memoFormatOf(template) {
  const format = MEMO_FORMATS[template];
  if (!format?.sections) throw new Error(`${template} is not a sectioned visit memo template`);
  return format;
}

/** Splits a sectioned memo into its sections without repairing it. Throws on any shape violation. */
function parseVisitMemoSections(text, specs = VISIT_MEMO_V2_SECTIONS) {
  const byHeader = new Map(specs.map(section => [section.header, section]));
  const sections = [];
  let current = null;
  if (!text.split('\n').some(line => /^\[[^\]]*\]$/.test(line.trim()))) throw new Error('visit memo has no section headers');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (/^\[[^\]]*\]$/.test(line)) {
      const section = byHeader.get(line);
      if (!section) throw new Error(`visit memo has an unknown section header ${line}`);
      const order = specs.indexOf(section);
      if (sections.some(entry => entry.id === section.id)) throw new Error(`visit memo repeats section ${line}`);
      if (current && specs.findIndex(entry => entry.id === current.id) > order)
        throw new Error(`visit memo section ${line} is out of order`);
      current = { id: section.id, header: section.header, lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) throw new Error('visit memo has text before the first section header');
    current.lines.push(line);
  }
  if (!sections.some(section => section.lines.length > 0)) throw new Error('visit memo has no content in any section');
  for (const section of sections) {
    const spec = specs.find(entry => entry.id === section.id);
    section.items = section.lines.filter(line => line.startsWith('- ')).length;
    if (spec.maxItems !== null && section.items > spec.maxItems)
      throw new Error(`visit memo section ${spec.header} has ${section.items} items; the limit is ${spec.maxItems}`);
  }
  return sections;
}

function validateVisitMemo(memo, format = MEMO_FORMATS['authoring-v5-h200-memo']) {
  if (typeof memo !== 'string') throw new TypeError('visit memo must be a string');
  const text = memo.trim();
  const characters = Array.from(text).length;
  if (characters === 0) throw new Error('visit memo is empty');
  if (characters > format.maxCharacters) throw new Error(`visit memo has ${characters} characters; the limit is ${format.maxCharacters}`);
  if (/<\/?visit-memo>/.test(text)) throw new Error('visit memo must not contain memo tags');
  if (!format.sections) return { text, characters };
  const sections = parseVisitMemoSections(text, format.sections);
  const summary = { text, characters, sections: sections.map(({ id, lines, items }) => ({ id, lines: lines.length, items })) };
  if (!format.labels) return summary;
  return { ...summary, labels: memoLabelsOf(sections).map(({ label }) => label) };
}

/** 〈label〉 tags with the memo line each sits on. Throws on unbalanced, empty or overlong tags. */
function memoLabelsOf(sections) {
  const found = [];
  for (const section of sections) for (const line of section.lines) {
    if (/[〈〉]/.test(line.replace(MEMO_LABEL, ''))) throw new Error(`visit memo has unbalanced 〈〉 in: ${line}`);
    for (const match of line.matchAll(MEMO_LABEL)) {
      const label = match[1].trim();
      if (!label) throw new Error(`visit memo has an empty 〈〉 in: ${line}`);
      if (Array.from(label).length > MEMO_LABEL_MAX_CHARACTERS)
        throw new Error(`visit memo label 〈${label}〉 is longer than ${MEMO_LABEL_MAX_CHARACTERS} characters`);
      found.push({ label, line, sectionId: section.id });
    }
  }
  return found;
}

/** Returns the last tagged memo in an actor's final reply, or null when there is none. Never repairs it. */
function extractVisitMemo(reply) {
  if (typeof reply !== 'string') throw new TypeError('actor reply must be a string');
  let last = null;
  for (const match of reply.matchAll(VISIT_MEMO_TAG)) last = (match[1] ?? match[2]).trim();
  return last;
}


const CERTAINTY_SURE = /\(확실/g;
const CERTAINTY_VAGUE = /\(흐릿/g;

/** Shape-only metrics of a sectioned memo for comparing personas and visits. Never judges content. */
function visitMemoMetrics(text, format = MEMO_FORMATS['authoring-v5-h200-memo-v2']) {
  const { characters, sections, labels } = validateVisitMemo(text, format);
  return { characters, sections, sureMarks: (text.match(CERTAINTY_SURE) ?? []).length,
    vagueMarks: (text.match(CERTAINTY_VAGUE) ?? []).length, ...(labels && { labels: labels.length }) };
}

// Recognition: the memo is shown verbatim in every menu, and memo lines whose
// 〈label〉 equals a name on the current screen are listed as recognised.
const VISIT_RECALL_VERSION = 'visit-recall-v1';
const VISIT_RECALL_NOTICE = 'rememberedVisit.memo는 지난 방문을 마치며 내가 쓴 메모 원문이다. recognized는 메모에 〈〉로 적어 둔 이름이 지금 화면에 똑같이 보여서 떠오른 메모 줄이다. 시스템은 글자가 같은지만 확인했고, 그 기억이 맞는지·어디로 갈지는 판단하지 않는다. 메모는 틀렸거나 매장이 바뀌었을 수 있으며 cueRef가 아니다. 선택은 현재 메뉴에서만 한다.';

function buildVisitRecall(memoText, format) {
  if (!format?.labels) throw new Error('Recognition needs a memo format with 〈label〉 tags');
  const { text } = validateVisitMemo(memoText, format);
  const labelled = memoLabelsOf(parseVisitMemoSections(text, format.sections)).map(({ label, line }) => ({ label, line }));
  return { version: VISIT_RECALL_VERSION, memoFormat: format.version, memo: text, memoSha256: sha256(text), labelled };
}

/** Names on the current screen that a person could have copied: stations, gate passages and the area. */
function visibleNamesOf(menu) {
  const observation = menu?.currentObservation?.observation ?? {};
  const names = new Set();
  const add = label => {
    if (typeof label !== 'string' || !label.trim()) return;
    names.add(label.trim());
    names.add(label.split(' · ')[0].trim());
  };
  for (const station of observation.visibleStations ?? []) add(station.label);
  for (const passage of observation.gatePassages ?? []) add(passage.label);
  add(observation.area?.label);
  return names;
}

function recallForMenu(recall, menu) {
  const visible = visibleNamesOf(menu);
  const recognized = [];
  for (const entry of recall.labelled) {
    if (visible.has(entry.label) && !recognized.some(item => item.label === entry.label && item.memoLine === entry.line))
      recognized.push({ label: entry.label, memoLine: entry.line });
  }
  return { version: VISIT_RECALL_VERSION, notice: VISIT_RECALL_NOTICE, memo: recall.memo, recognized };
}

// Per-persona memo profiles: how this person remembers, not what. Bound to the
// persona version they were written for, so a persona change forces a review.
const VISIT_MEMO_PROFILES_FILE = path.join(__dirname, 'personas', 'visit-memo-profiles.json');

function visitMemoProfileOf(personaId, personaVersion, file = VISIT_MEMO_PROFILES_FILE, { routeInstructions = false } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  const catalog = JSON.parse(text);
  const profile = catalog.profiles?.[personaId];
  if (!profile) throw new Error(`No visit memo profile for persona ${personaId}`);
  if (String(profile.personaVersion) !== String(personaVersion))
    throw new Error(`Visit memo profile for ${personaId} was written for persona version ${profile.personaVersion}, not ${personaVersion}`);
  return {
    actorCopy: { version: catalog.version, notice: catalog.notice, placeForm: profile.placeForm, planForm: profile.planForm,
      generalTips: profile.generalTips, confidence: profile.confidence,
      instructions: [...profile.instructions, ...(routeInstructions ? requiredRouteInstructions(profile, personaId) : [])] },
    provenance: { version: catalog.version, file: path.resolve(file), sha256: sha256(text), personaId, personaVersion: String(personaVersion) },
  };
}

function requiredRouteInstructions(profile, personaId) {
  if (!Array.isArray(profile.routeInstructions) || profile.routeInstructions.length === 0)
    throw new Error(`Visit memo profile for ${personaId} has no routeInstructions for [들어가는 길]`);
  return profile.routeInstructions;
}

// The same store is the same building: layout, outer walls, entrance and exit.
// Shelf order, products, people and other visit details may change between
// visits without making it a different store, and the person is not told.
const STORE_KEY_VERSION = 'store-key-v1';
const STORE_KEY_BASIS = Object.freeze(['world.layoutVersion', 'world.config.layoutId', 'world.config.entranceConstruction', 'world.world', 'world.walls', 'world.entrance', 'world.exit']);

function storeKeyOf(prepareResponse) {
  const world = prepareResponse?.bundle?.worldReference?.world;
  if (!world?.config?.layoutId) throw new Error('prepare response has no worldReference.world.config.layoutId to identify the store');
  const basis = { layoutVersion: world.layoutVersion ?? null, layoutId: world.config.layoutId, entranceConstruction: world.config.entranceConstruction ?? null,
    world: world.world ?? null, walls: world.walls ?? null, entrance: world.entrance ?? null, exit: world.exit ?? null };
  return `${STORE_KEY_VERSION}:${world.config.layoutId}:${sha256(JSON.stringify(basis)).slice(0, 16)}`;
}

// Visit memo chain: one file per person x store. Each visit's memo is the
// person's rewrite of the last valid memo; the chain proves that hand-over.
const CHAIN_VERSION = 'visit-memo-chain-v1';
const CHAIN_TEMPLATE = 'authoring-v5-h200-memo-v2';
// memory: each visit gets the last valid memo. no-memory (control): every visit
// is presented as a first visit with no memo, while the person still writes one.
const CHAIN_CONDITIONS = Object.freeze(['memory', 'no-memory']);
const MEMO_STATUSES = Object.freeze(['valid', 'missing', 'invalid', 'no-visit']);
const VISIT_NOTICE = 'visit.number는 이번 방문을 포함해 이 인물이 이 마트에 온 횟수다. 인물은 대략 이 정도 와 봤다는 것을 안다. 이번 방문이 2번째 이상인데 previousVisit이 없으면, 와 본 적은 있지만 말로 떠올릴 만한 기억이 남지 않은 상태다.';
const OTHER_STORE_TIPS_VERSION = 'other-store-tips-v1';
const OTHER_STORE_TIPS_NOTICE = 'otherStoreTips.tips는 이 인물이 다른 마트를 다녀와서 [어느 마트에서나]에 자기 말로 적은 요령이다. 이 마트는 인물에게 처음 오는 곳이다. 요령이 여기서도 통할지는 모르며, 인물이 현재 화면과 대조해 쓸지 정한다.';

function readChain(file) {
  const text = fs.readFileSync(file, 'utf8');
  const chain = JSON.parse(text);
  if (chain.version !== CHAIN_VERSION) throw new Error(`${file} is not a ${CHAIN_VERSION} file`);
  if (!Array.isArray(chain.entries)) throw new Error(`${file} has no entries array`);
  return { chain, text, sha256: sha256(text) };
}

function readChainMemo(entry, chainFile) {
  const file = path.resolve(path.dirname(chainFile), entry.outputMemoFile);
  const text = fs.readFileSync(file, 'utf8');
  if (sha256(text) !== entry.outputMemoSha256) throw new Error(`Visit memo ${file} changed after it was recorded`);
  return text;
}

/**
 * What the next visit receives: the visit number the person is told, the last
 * valid memo (verbatim) and any carried other-store tips. `index` is the real
 * visit count; it differs from `number` only in a no-memory control chain.
 */
function nextVisitOf(chain, chainFile) {
  const visits = chain.entries.filter(entry => entry.memoStatus !== 'no-visit').length;
  const condition = chain.condition ?? 'memory';
  if (!CHAIN_CONDITIONS.includes(condition)) throw new Error(`Unknown visit memo chain condition ${condition}`);
  if (condition === 'no-memory') return { index: visits + 1, number: 1, previousMemo: null, otherStoreTips: null };
  const lastValid = [...chain.entries].reverse().find(entry => entry.memoStatus === 'valid') ?? null;
  return {
    index: visits + 1,
    number: visits + 1,
    previousMemo: lastValid ? { visit: lastValid.visit, text: readChainMemo(lastValid, chainFile), sha256: lastValid.outputMemoSha256 } : null,
    otherStoreTips: !lastValid && chain.carriedAnyStoreTips ? chain.carriedAnyStoreTips : null,
  };
}

module.exports = {
  sha256, MEMO_REWRITE_VERSION, memoRewritePrompt, PREVIOUS_VISIT_V3_VERSION, VISIT_MEMO_V3_MAX_CHARACTERS, VISIT_MEMO_V3_SECTIONS, memoFormatOf, memoLabelsOf,
  VISIT_RECALL_VERSION, buildVisitRecall, visibleNamesOf, recallForMenu, CHAIN_CONDITIONS, PREVIOUS_VISIT_VERSION, VISIT_MEMO_MAX_CHARACTERS, PREVIOUS_VISIT_NOTICE, PREVIOUS_VISIT_V2_VERSION,
  VISIT_MEMO_V2_MAX_CHARACTERS, VISIT_MEMO_V2_SECTIONS, PREVIOUS_VISIT_V2_NOTICE, MEMO_FORMATS, parseVisitMemoSections,
  validateVisitMemo, extractVisitMemo, visitMemoMetrics, VISIT_MEMO_PROFILES_FILE, visitMemoProfileOf, STORE_KEY_VERSION,
  STORE_KEY_BASIS, storeKeyOf, CHAIN_VERSION, CHAIN_TEMPLATE, MEMO_STATUSES, VISIT_NOTICE, OTHER_STORE_TIPS_VERSION,
  OTHER_STORE_TIPS_NOTICE, readChain, readChainMemo, nextVisitOf,
};
