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

// Which memo format each memo template reads and writes.
const MEMO_FORMATS = Object.freeze({
  'authoring-v5-h200-memo': Object.freeze({ version: PREVIOUS_VISIT_VERSION, maxCharacters: VISIT_MEMO_MAX_CHARACTERS, notice: PREVIOUS_VISIT_NOTICE, sections: null }),
  'authoring-v5-h200-memo-v2': Object.freeze({ version: PREVIOUS_VISIT_V2_VERSION, maxCharacters: VISIT_MEMO_V2_MAX_CHARACTERS, notice: PREVIOUS_VISIT_V2_NOTICE, sections: VISIT_MEMO_V2_SECTIONS }),
});

/** Splits a v2 memo into its sections without repairing it. Throws on any shape violation. */
function parseVisitMemoSections(text) {
  const byHeader = new Map(VISIT_MEMO_V2_SECTIONS.map(section => [section.header, section]));
  const sections = [];
  let current = null;
  if (!text.split('\n').some(line => /^\[[^\]]*\]$/.test(line.trim()))) throw new Error('visit memo has no section headers');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (/^\[[^\]]*\]$/.test(line)) {
      const section = byHeader.get(line);
      if (!section) throw new Error(`visit memo has an unknown section header ${line}`);
      const order = VISIT_MEMO_V2_SECTIONS.indexOf(section);
      if (sections.some(entry => entry.id === section.id)) throw new Error(`visit memo repeats section ${line}`);
      if (current && VISIT_MEMO_V2_SECTIONS.findIndex(entry => entry.id === current.id) > order)
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
    const spec = VISIT_MEMO_V2_SECTIONS.find(entry => entry.id === section.id);
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
  const sections = parseVisitMemoSections(text);
  return { text, characters, sections: sections.map(({ id, lines, items }) => ({ id, lines: lines.length, items })) };
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

/** Shape-only metrics of a v2 memo for comparing personas and visits. Never judges content. */
function visitMemoMetrics(text) {
  const { characters, sections } = validateVisitMemo(text, MEMO_FORMATS['authoring-v5-h200-memo-v2']);
  return { characters, sections, sureMarks: (text.match(CERTAINTY_SURE) ?? []).length, vagueMarks: (text.match(CERTAINTY_VAGUE) ?? []).length };
}

// Per-persona memo profiles: how this person remembers, not what. Bound to the
// persona version they were written for, so a persona change forces a review.
const VISIT_MEMO_PROFILES_FILE = path.join(__dirname, 'personas', 'visit-memo-profiles.json');

function visitMemoProfileOf(personaId, personaVersion, file = VISIT_MEMO_PROFILES_FILE) {
  const text = fs.readFileSync(file, 'utf8');
  const catalog = JSON.parse(text);
  const profile = catalog.profiles?.[personaId];
  if (!profile) throw new Error(`No visit memo profile for persona ${personaId}`);
  if (String(profile.personaVersion) !== String(personaVersion))
    throw new Error(`Visit memo profile for ${personaId} was written for persona version ${profile.personaVersion}, not ${personaVersion}`);
  return {
    actorCopy: { version: catalog.version, notice: catalog.notice, placeForm: profile.placeForm, planForm: profile.planForm,
      generalTips: profile.generalTips, confidence: profile.confidence, instructions: [...profile.instructions] },
    provenance: { version: catalog.version, file: path.resolve(file), sha256: sha256(text), personaId, personaVersion: String(personaVersion) },
  };
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

/** What the next visit receives: its number, the last valid memo (verbatim) and any carried other-store tips. */
function nextVisitOf(chain, chainFile) {
  const visits = chain.entries.filter(entry => entry.memoStatus !== 'no-visit').length;
  const lastValid = [...chain.entries].reverse().find(entry => entry.memoStatus === 'valid') ?? null;
  return {
    number: visits + 1,
    previousMemo: lastValid ? { visit: lastValid.visit, text: readChainMemo(lastValid, chainFile), sha256: lastValid.outputMemoSha256 } : null,
    otherStoreTips: !lastValid && chain.carriedAnyStoreTips ? chain.carriedAnyStoreTips : null,
  };
}

module.exports = {
  sha256, PREVIOUS_VISIT_VERSION, VISIT_MEMO_MAX_CHARACTERS, PREVIOUS_VISIT_NOTICE, PREVIOUS_VISIT_V2_VERSION,
  VISIT_MEMO_V2_MAX_CHARACTERS, VISIT_MEMO_V2_SECTIONS, PREVIOUS_VISIT_V2_NOTICE, MEMO_FORMATS, parseVisitMemoSections,
  validateVisitMemo, extractVisitMemo, visitMemoMetrics, VISIT_MEMO_PROFILES_FILE, visitMemoProfileOf, STORE_KEY_VERSION,
  STORE_KEY_BASIS, storeKeyOf, CHAIN_VERSION, CHAIN_TEMPLATE, MEMO_STATUSES, VISIT_NOTICE, OTHER_STORE_TIPS_VERSION,
  OTHER_STORE_TIPS_NOTICE, readChain, readChainMemo, nextVisitOf,
};
