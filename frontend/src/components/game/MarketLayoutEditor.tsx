import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import {
  createMarketEnvironment,
  MARKET_LAYOUT_OPTIONS,
  type MarketEnvironment,
  type MarketEnvironmentConfig
} from '../../game/marketEnvironment';
import {
  MARKET_CUSTOMER_APPEARANCES,
  MARKET_EMPLOYEE_APPEARANCES,
  getMarketPersonAppearance
} from '../../game/marketPeople';
import {
  applyMarketTilemapToConfig,
  clearMarketTilemapFromConfig,
  createMarketTilemapFromEnvironment,
  getMarketTilemapFootprint,
  getMarketTilemapGrid,
  parseMarketTilemapJson,
  serializeMarketTilemap,
  validateMarketTilemapPlacement,
  type MarketTilemapV1
} from '../../game/marketTilemap';
import type { MarketCategoryId } from '../../game/scenarios';
import type { Rect } from '../../game/prototypeWorld';
import { getMarketShelfUnitRects } from '../../game/marketFixtureLayout';
import { MarketLayoutLibrary } from './MarketLayoutLibrary';
import { MarketLayoutPreview } from './MarketLayoutPreview';
import {
  SettingsSurface,
  SettingsTabs,
  SettingsPage,
  SettingsScroll,
  SettingsAccordion,
  SettingsInput,
  SettingsButton,
  settingsAssets,
  settingsColors as c,
  ui
} from './MarketSettingsUi';

type Shelf = MarketTilemapV1['shelves'][number];
type Person = MarketTilemapV1['people'][number];
type Selection = { kind: 'shelf'; id: MarketCategoryId } | { kind: 'person'; id: string };
const CATEGORIES: Record<
  MarketCategoryId,
  { label: string; short: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  produce: { label: '과일·채소', short: '과일·채소', color: '#A7B98A', icon: 'leaf-outline' },
  fresh: { label: '냉장식품', short: '냉장', color: '#99B7BF', icon: 'snow-outline' },
  household: { label: '생활용품', short: '생활', color: '#C1ADD0', icon: 'basket-outline' },
  meal: { label: '간편식품', short: '간편식', color: '#D6B388', icon: 'restaurant-outline' },
  drink: { label: '음료', short: '음료', color: '#CCB890', icon: 'cafe-outline' }
};
const MAX_HISTORY = 40;
const clone = (map: MarketTilemapV1): MarketTilemapV1 => JSON.parse(JSON.stringify(map));
const sameSelection = (a: Selection | null, b: Selection) => a?.kind === b.kind && a.id === b.id;
const contains = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/** The editor keeps an isolated draft; only the bottom apply action changes the setup. */
export function MarketLayoutEditor({
  config,
  onApply,
  onClose,
  onOpenTransfer
}: {
  config: MarketEnvironmentConfig;
  onApply: (next: MarketEnvironmentConfig) => void;
  onClose: () => void;
  /** A settings host owns file transfer; standalone callers keep the legacy tools. */
  onOpenTransfer?: (next: MarketEnvironmentConfig) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const wide = screenWidth >= 860;
  const [initial] = useState(() => createMarketTilemapFromEnvironment(createMarketEnvironment(config)));
  const [draft, setDraft] = useState(() => clone(initial));
  const [history, setHistory] = useState<MarketTilemapV1[]>([]);
  const [selected, setSelected] = useState<Selection | null>({ kind: 'shelf', id: initial.shelves[0].categoryId });
  const [zoom, setZoom] = useState(1);
  const [mapWidth, setMapWidth] = useState(wide ? 580 : Math.max(250, screenWidth - 52));
  const [tab, setTab] = useState<'map' | 'test' | 'library' | 'json'>('map');
  const [listOpen, setListOpen] = useState(false);
  const [preview, setPreview] = useState<{ environment: MarketEnvironment; initialMode: 'overview' | 'walk' } | null>(
    null
  );
  const closePreview = useCallback(() => setPreview(null), []);
  const [json, setJson] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const revision = useRef(0);
  const pendingFile = useRef<HTMLInputElement | null>(null);
  const grid = getMarketTilemapGrid(draft.layoutId);
  const background = useMemo(
    () => createMarketEnvironment({ ...clearMarketTilemapFromConfig(config), layoutId: draft.layoutId }),
    [config, draft.layoutId]
  );
  const entry: Shelf | Person | undefined =
    selected?.kind === 'shelf'
      ? draft.shelves.find((item) => item.categoryId === selected.id)
      : draft.people.find((item) => item.id === selected?.id);
  const [colText, setColText] = useState('');
  const [rowText, setRowText] = useState('');
  const selectionLabel =
    selected?.kind === 'shelf'
      ? CATEGORIES[selected.id].label
      : entry && 'kind' in entry
        ? `${entry.kind === 'employee' ? '종업원' : '손님'} ${draft.people.filter((p) => p.kind === entry.kind).findIndex((p) => p.id === entry.id) + 1}`
        : '물건을 선택해 주세요';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
      pendingFile.current?.remove();
    };
  }, []);
  useEffect(() => {
    setColText(entry ? String(entry.col + 1) : '');
    setRowText(entry ? String(entry.row + 1) : '');
  }, [draft, selected?.id, selected?.kind]);
  useEffect(() => {
    setChecking(true);
    const timer = setTimeout(() => {
      try {
        setValidation(validateMarketTilemapPlacement(draft, config));
      } catch (reason) {
        setValidation({ valid: false, errors: [reason instanceof Error ? reason.message : '배치를 확인해 주세요.'] });
      }
      setChecking(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, config]);

  const change = (next: MarketTilemapV1, message = '') => {
    revision.current += 1;
    setHistory((previous) => [...previous, clone(draft)].slice(-MAX_HISTORY));
    setDraft(next);
    setValidation(null);
    setChecking(true);
    setError('');
    setNotice(message);
  };
  const move = (col: number, row: number) => {
    if (!selected || !entry) return;
    if (
      !Number.isInteger(col) ||
      !Number.isInteger(row) ||
      col < 0 ||
      row < 0 ||
      col >= grid.columns ||
      row >= grid.rows
    ) {
      setError(`가로 1–${grid.columns}, 세로 1–${grid.rows}칸 안에서 골라 주세요.`);
      return;
    }
    const next = clone(draft);
    const target =
      selected.kind === 'shelf'
        ? next.shelves.find((item) => item.categoryId === selected.id)
        : next.people.find((item) => item.id === selected.id);
    if (!target || (target.col === col && target.row === row)) return;
    target.col = col;
    target.row = row;
    change(next);
  };
  const tapMap = (x: number, y: number) => {
    const col = Math.floor(x / grid.cellSize),
      row = Math.floor(y / grid.cellSize);
    const person = draft.people.find((item) => contains(getMarketTilemapFootprint(item), x, y));
    const shelf = draft.shelves.find((item) => contains(getMarketTilemapFootprint(item), x, y));
    const hit: Selection | null = person
      ? { kind: 'person', id: person.id }
      : shelf
        ? { kind: 'shelf', id: shelf.categoryId }
        : null;
    if (hit && !sameSelection(selected, hit)) {
      setSelected(hit);
      setNotice('');
      return;
    }
    move(col, row);
  };
  const rotate = () => {
    if (selected?.kind !== 'shelf') return;
    change({
      ...draft,
      shelves: draft.shelves.map((item) =>
        item.categoryId === selected.id
          ? { ...item, orientation: item.orientation === 'horizontal' ? 'vertical' : 'horizontal' }
          : item
      )
    });
  };
  const addPerson = (kind: Person['kind']) => {
    const count = draft.people.filter((item) => item.kind === kind).length;
    const max = kind === 'employee' ? 3 : 5;
    if (count >= max) return;
    let suffix = 1;
    while (draft.people.some((item) => item.id === `${kind}-custom-${suffix}`)) suffix += 1;
    const id = `${kind}-custom-${suffix}`;
    // Try existing safe actor slots first, then open floor cells. Full reachability is checked below.
    const candidates = [...background.employees, ...background.customers].map((item) => ({
      col: Math.floor(item.point.x / grid.cellSize),
      row: Math.floor(item.point.y / grid.cellSize)
    }));
    const salesFloor = background.walkableAreas[0];
    for (
      let row = Math.ceil(salesFloor.y / grid.cellSize) + 3;
      row < Math.floor((salesFloor.y + salesFloor.height) / grid.cellSize) - 2;
      row += 3
    ) {
      for (
        let col = Math.ceil(salesFloor.x / grid.cellSize) + 3;
        col < Math.floor((salesFloor.x + salesFloor.width) / grid.cellSize) - 2;
        col += 3
      )
        candidates.push({ col, row });
    }
    let added: Person = { id, kind, col: 25, row: 20, appearance: count };
    for (const candidate of candidates) {
      const actor = { ...added, ...candidate };
      const rect = getMarketTilemapFootprint(actor);
      const overlaps =
        [...draft.shelves, ...draft.people].some((item) => {
          const other = getMarketTilemapFootprint(item);
          return (
            rect.x < other.x + other.width + 10 &&
            rect.x + rect.width + 10 > other.x &&
            rect.y < other.y + other.height + 10 &&
            rect.y + rect.height + 10 > other.y
          );
        }) ||
        [
          ...background.walls,
          ...background.objects.map((item) => item.rect),
          ...background.checkouts.map((item) => item.rect)
        ].some(
          (other) =>
            rect.x < other.x + other.width &&
            rect.x + rect.width > other.x &&
            rect.y < other.y + other.height &&
            rect.y + rect.height > other.y
        );
      if (!overlaps) {
        added = actor;
        break;
      }
    }
    change(
      { ...draft, people: [...draft.people, added] },
      `${kind === 'employee' ? '종업원' : '손님'}을 추가했어요. 위치를 바꿀 수 있어요.`
    );
    setSelected({ kind: 'person', id });
  };
  const removePerson = () => {
    if (selected?.kind !== 'person' || !entry || !('kind' in entry)) return;
    if (entry.kind === 'employee' && draft.people.filter((item) => item.kind === 'employee').length <= 1) {
      setError('도움을 요청할 종업원은 한 명 이상 필요해요.');
      return;
    }
    change({ ...draft, people: draft.people.filter((item) => item.id !== selected.id) });
    setSelected(null);
  };
  const verify = (map = draft) => {
    const result = validateMarketTilemapPlacement(map, config);
    setValidation(result);
    setChecking(false);
    if (!result.valid) throw new Error(result.errors.join('\n'));
    return map;
  };
  const importJson = (text: string) => {
    try {
      const imported = parseMarketTilemapJson(text);
      const result = validateMarketTilemapPlacement(imported, config);
      if (!result.valid) throw new Error(result.errors.join('\n'));
      change(imported, 'JSON 배치를 불러왔어요. 지도를 확인한 뒤 적용해 주세요.');
      setSelected({ kind: 'shelf', id: imported.shelves[0].categoryId });
      setJson(serializeMarketTilemap(imported));
      setTab('map');
      setZoom(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 내용을 확인해 주세요.');
    }
  };
  const importFile = () => {
    if (Platform.OS !== 'web' || busy) return;
    pendingFile.current?.remove();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    pendingFile.current = input;
    const requestedRevision = revision.current;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !mounted.current || requestedRevision !== revision.current) return;
      if (file.size > 1_000_000) {
        setError('JSON 파일은 1MB 이하로 골라 주세요.');
        return;
      }
      setBusy(true);
      try {
        const text = await file.text();
        if (mounted.current && requestedRevision === revision.current) importJson(text);
      } catch {
        if (mounted.current) setError('파일을 읽지 못했어요. JSON 내용을 붙여 넣어 주세요.');
      } finally {
        if (mounted.current) setBusy(false);
        input.remove();
      }
    };
    input.click();
  };
  const draftWithPendingCoordinates = () => {
    // Native inputs may still be focused when a footer action is pressed.
    let candidate = draft;
    if (entry && selected && (colText !== String(entry.col + 1) || rowText !== String(entry.row + 1))) {
      const col = Number(colText) - 1,
        row = Number(rowText) - 1;
      if (
        !Number.isInteger(col) ||
        !Number.isInteger(row) ||
        col < 0 ||
        row < 0 ||
        col >= grid.columns ||
        row >= grid.rows
      ) {
        throw new Error(`가로 1–${grid.columns}, 세로 1–${grid.rows}칸 안에서 골라 주세요.`);
      }
      candidate = clone(draft);
      const target =
        selected.kind === 'shelf'
          ? candidate.shelves.find((item) => item.categoryId === selected.id)
          : candidate.people.find((item) => item.id === selected.id);
      if (target) {
        target.col = col;
        target.row = row;
      }
      change(candidate);
    }
    return candidate;
  };
  const commitCoordinates = () => {
    try {
      draftWithPendingCoordinates();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '입력한 좌표를 확인해 주세요.');
    }
  };
  const exportJson = async () => {
    try {
      const text = serializeMarketTilemap(verify(draftWithPendingCoordinates()));
      setJson(text);
      setError('');
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `market-layout-${draft.layoutId}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('현재 배치를 JSON 파일로 저장했어요.');
      } else await Share.share({ title: '마트 배치 JSON', message: text });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON을 내보내지 못했어요.');
    }
  };
  const apply = () => {
    try {
      onApply(applyMarketTilemapToConfig(config, verify(draftWithPendingCoordinates())));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '배치를 확인해 주세요.');
    }
  };
  const switchTab = (next: typeof tab) => {
    try {
      const candidate = draftWithPendingCoordinates();
      if (next === 'json') setJson(serializeMarketTilemap(candidate));
      setError('');
      setTab(next);
      Keyboard.dismiss();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '입력한 좌표를 확인해 주세요.');
    }
  };
  const openPreview = (initialMode: 'overview' | 'walk') => {
    try {
      const candidate = verify(draftWithPendingCoordinates());
      const environment = createMarketEnvironment(applyMarketTilemapToConfig(config, candidate));
      setError('');
      Keyboard.dismiss();
      setPreview({ environment, initialMode });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '미리 볼 배치를 확인해 주세요.');
    }
  };
  const loadSavedLayout = (tilemap: MarketTilemapV1) => {
    // A saved layout changes movable objects only; this visit keeps its own fixed facilities.
    const result = validateMarketTilemapPlacement(tilemap, config);
    if (!result.valid) throw new Error(result.errors.join('\n'));
    change(clone(tilemap), '보관함의 배치를 불러왔어요. 확인한 뒤 적용해 주세요.');
    setSelected({ kind: 'shelf', id: tilemap.shelves[0].categoryId });
    setZoom(1);
    setTab('map');
    Keyboard.dismiss();
  };
  const statusErrors = error ? error.split('\n') : (validation?.errors ?? []);
  const errors = statusErrors.slice(0, 3);
  const selectedPerson = entry && 'kind' in entry ? entry : undefined;
  const appearanceOptions =
    selectedPerson?.kind === 'employee' ? MARKET_EMPLOYEE_APPEARANCES : MARKET_CUSTOMER_APPEARANCES;
  const gridPreview = <GridMap
    map={draft}
    background={background}
    width={Math.min(mapWidth, (300 * grid.width) / grid.height) * zoom}
    selected={selected}
    onTap={tapMap}
  />;

  return (
    <>
      <SettingsSurface
        title="직접 배치 편집"
        hidden={!!preview}
        footer={
          <>
            <SettingsButton text="뒤로가기" footer onPress={onClose} />
            <SettingsButton
              text={onOpenTransfer ? '편집 완료' : '배치 적용'}
              footer
              selected
              onPress={apply}
              disabled={busy || checking || validation?.valid === false}
            />
          </>
        }
      >
        <SettingsTabs
          compact
          value={tab}
          onChange={switchTab}
          options={[
            { id: 'map', label: '그리드 편집' },
            { id: 'test', label: '테스트' },
            { id: 'library', label: '보관함' },
            ...(!onOpenTransfer ? [{ id: 'json' as const, label: 'JSON', accessibilityLabel: 'JSON 가져오기' }] : [])
          ]}
        />
        <SettingsScroll
          style={ui.scroll}
          contentContainerStyle={[ui.content, { paddingTop: 10 }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          testID="market-editor-scroll"
        >
          <SettingsPage key={tab}>
            {tab === 'map' ? (
              <>
                <View style={s.mapMeta}>
                  <Text style={s.metaText}>
                    {config.tilemap ? '직접 만든 배치' : '새로운 배치'} ·{' '}
                    {draft.layoutId === 'classic'
                      ? '기본 형태'
                      : draft.layoutId === 'aisles'
                        ? '가로 형태'
                        : '모퉁이 형태'}
                  </Text>
                  <Text style={s.metaText}>
                    {grid.columns} X {grid.rows}
                  </Text>
                </View>
                <View
                  onLayout={(event) => setMapWidth(Math.max(200, event.nativeEvent.layout.width))}
                  style={s.figmaMap}
                >
                  {zoom > 1 ? <ScrollView
                    nestedScrollEnabled
                    style={{ flex: 1 }}
                    contentContainerStyle={{ minHeight: '100%', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      bounces={false}
                      contentContainerStyle={{ minWidth: '100%', justifyContent: 'center' }}
                    >
                      {gridPreview}
                    </ScrollView>
                  </ScrollView> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{gridPreview}</View>}
                  <View pointerEvents="none" style={s.mapLegend}>
                    <Legend color="#BCA98D" text="고정 시설" />
                    <Legend color="#527665" text="종업원" />
                    <Legend color="#9B7793" text="손님" />
                  </View>
                </View>
                <Text style={s.selectionName}>{selectionLabel}</Text>
                <View style={s.coordinateControls}>
                  <View style={s.directionPad}>
                    <Image source={settingsAssets.directionPad} style={{ width: 84, height: 84 }} />
                    {(
                      [
                        { label: '한 칸 왼쪽', col: -1, row: 0, left: 0, top: 28 },
                        { label: '한 칸 위', col: 0, row: -1, left: 28, top: 0 },
                        { label: '한 칸 아래', col: 0, row: 1, left: 28, top: 56 },
                        { label: '한 칸 오른쪽', col: 1, row: 0, left: 56, top: 28 }
                      ] as const
                    ).map((direction) => (
                      <PressScale
                        key={direction.label}
                        accessibilityRole="button"
                        accessibilityLabel={direction.label}
                        disabled={!entry}
                        onPress={() => {
                          if (entry) move(entry.col + direction.col, entry.row + direction.row);
                        }}
                        hitSlop={6}
                        style={{
                          position: 'absolute',
                          left: direction.left,
                          top: direction.top,
                          width: 28,
                          height: 28
                        }}
                      >
                        <View />
                      </PressScale>
                    ))}
                  </View>
                  <View style={s.axisFields}>
                    <View style={s.axisRow}>
                      <Text style={s.axisLabel}>가로</Text>
                      <SettingsInput
                        style={s.axisInput}
                        accessibilityLabel="선택한 물건 가로 칸"
                        value={colText}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        onChangeText={setColText}
                        onEndEditing={commitCoordinates}
                        editable={!!entry}
                      />
                    </View>
                    <View style={s.axisRow}>
                      <Text style={s.axisLabel}>세로</Text>
                      <SettingsInput
                        style={s.axisInput}
                        accessibilityLabel="선택한 물건 세로 칸"
                        value={rowText}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        onChangeText={setRowText}
                        onEndEditing={commitCoordinates}
                        editable={!!entry}
                      />
                    </View>
                  </View>
                </View>
                <View style={{ marginTop: 24 }}>
                  <SettingsAccordion label="목록 보기" open={listOpen} onToggle={() => setListOpen(!listOpen)}>
                    <View style={s.inspector}>
                      <Text style={s.sectionTitle}>진열대</Text>
                      <View style={s.palette}>
                        {draft.shelves.map((item) => (
                          <Button
                            key={item.categoryId}
                            text={CATEGORIES[item.categoryId].label}
                            selected={sameSelection(selected, { kind: 'shelf', id: item.categoryId })}
                            onPress={() => {
                              setSelected({ kind: 'shelf', id: item.categoryId });
                              setNotice('');
                            }}
                          />
                        ))}
                      </View>
                      <View style={s.sectionHeading}>
                        <Text style={s.sectionTitle}>사람</Text>
                        <Text style={s.hint}>
                          종업원 {draft.people.filter((p) => p.kind === 'employee').length}/3 · 손님{' '}
                          {draft.people.filter((p) => p.kind === 'customer').length}/5
                        </Text>
                      </View>
                      <View style={s.palette}>
                        {draft.people.map((item) => (
                          <Button
                            key={item.id}
                            text={`${item.kind === 'employee' ? '종업원' : '손님'} ${draft.people.filter((p) => p.kind === item.kind).findIndex((p) => p.id === item.id) + 1}`}
                            selected={sameSelection(selected, { kind: 'person', id: item.id })}
                            onPress={() => {
                              setSelected({ kind: 'person', id: item.id });
                              setNotice('');
                            }}
                          />
                        ))}
                      </View>
                      <View style={s.wrap}>
                        <Button
                          text="종업원 추가"
                          disabled={draft.people.filter((p) => p.kind === 'employee').length >= 3}
                          onPress={() => addPerson('employee')}
                        />
                        <Button
                          text="손님 추가"
                          disabled={draft.people.filter((p) => p.kind === 'customer').length >= 5}
                          onPress={() => addPerson('customer')}
                        />
                      </View>
                      {selected?.kind === 'shelf' ? (
                        <Button text="회전" onPress={rotate} />
                      ) : selectedPerson ? (
                        <View style={s.wrap}>
                          <Button
                            text="모습 변경"
                            onPress={() =>
                              change({
                                ...draft,
                                people: draft.people.map((item) =>
                                  item.id === selectedPerson.id
                                    ? { ...item, appearance: (item.appearance + 1) % appearanceOptions.length }
                                    : item
                                )
                              })
                            }
                          />
                          <Tool
                            label="선택한 사람 삭제"
                            icon="trash-outline"
                            onPress={removePerson}
                            disabled={
                              selectedPerson.kind === 'employee' &&
                              draft.people.filter((p) => p.kind === 'employee').length <= 1
                            }
                          />
                        </View>
                      ) : null}
                      <View style={s.wrap}>
                        <Tool
                          label="배치 실행 취소"
                          icon="arrow-undo-outline"
                          disabled={!history.length || busy}
                          onPress={() => {
                            const previous = history[history.length - 1];
                            if (!previous) return;
                            revision.current += 1;
                            setDraft(previous);
                            setHistory(history.slice(0, -1));
                            setError('');
                            setNotice('이전 배치로 되돌렸어요.');
                            setValidation(null);
                            setChecking(true);
                          }}
                        />
                        <Tool
                          label="지도 축소"
                          icon="remove"
                          disabled={zoom === 1}
                          onPress={() => setZoom(Math.max(1, zoom - 0.5))}
                        />
                        <Text style={s.zoomLabel}>{Math.round(zoom * 100)}%</Text>
                        <Tool
                          label="지도 확대"
                          icon="add"
                          disabled={zoom === 3}
                          onPress={() => setZoom(Math.min(3, zoom + 0.5))}
                        />
                      </View>
                      <Button
                        text="편집 전 배치로"
                        onPress={() => {
                          change(clone(initial), '편집을 열기 전 배치로 돌아왔어요.');
                          setSelected({ kind: 'shelf', id: initial.shelves[0].categoryId });
                        }}
                      />
                      <Text style={s.label}>기본 도면</Text>
                      <View style={s.wrap}>
                        {MARKET_LAYOUT_OPTIONS.map((option) => (
                          <Button
                            key={option.id}
                            text={option.label}
                            selected={draft.layoutId === option.id}
                            onPress={() => {
                              const next = createMarketTilemapFromEnvironment(
                                createMarketEnvironment({
                                  ...clearMarketTilemapFromConfig(config),
                                  layoutId: option.id
                                })
                              );
                              change(next, '기본 도면을 불러왔어요. 실행 취소로 이전 배치를 되돌릴 수 있어요.');
                              setZoom(1);
                            }}
                          />
                        ))}
                      </View>
                      {onOpenTransfer ? (
                        <SettingsButton
                          text="세이브 · 로드"
                          onPress={() => {
                            try {
                              onOpenTransfer(applyMarketTilemapToConfig(config, verify(draftWithPendingCoordinates())));
                            } catch (reason) {
                              setError(reason instanceof Error ? reason.message : '배치를 확인해 주세요.');
                            }
                          }}
                        />
                      ) : null}
                    </View>
                  </SettingsAccordion>
                </View>
              </>
            ) : tab === 'test' ? (
              <View style={{ paddingTop: 10, gap: 12 }}>
                <SettingsButton
                  text="실제 전경"
                  label="실제 모습"
                  onPress={() => openPreview('overview')}
                  style={s.testButton}
                />
                <SettingsButton
                  text="인게임 테스트"
                  label="여기서 걸어보기"
                  onPress={() => openPreview('walk')}
                  style={s.testButton}
                />
              </View>
            ) : tab === 'library' ? (
              <MarketLayoutLibrary
                getCurrentLayout={() => verify(draftWithPendingCoordinates())}
                onLoad={loadSavedLayout}
              />
            ) : (
              <View style={s.jsonPanel}>
                <Text style={s.sectionTitle}>배치 JSON</Text>
                <Text style={s.description}>저장한 배치를 붙여 넣고 불러오세요.</Text>
                {Platform.OS === 'web' ? (
                  <Button text={busy ? '파일 읽는 중' : 'JSON 파일 열기'} disabled={busy} onPress={importFile} />
                ) : null}
                <TextInput
                  accessibilityLabel="마트 배치 JSON"
                  value={json}
                  onChangeText={(text) => {
                    revision.current += 1;
                    setJson(text);
                    setError('');
                  }}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  style={s.jsonInput}
                />
                <Button text="붙여 넣은 배치 불러오기" selected onPress={() => importJson(json)} disabled={busy} />
                <Button
                  text="현재 지도 JSON 보기"
                  onPress={() => {
                    setJson(serializeMarketTilemap(draft));
                    setError('');
                  }}
                />
                <Button
                  text="JSON 저장"
                  onPress={() => {
                    void exportJson();
                  }}
                  disabled={busy}
                />
              </View>
            )}
            {errors.length ? (
              <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.errorBox}>
                {errors.map((message, index) => (
                  <Text key={`${index}-${message}`} style={s.errorText}>
                    {message}
                  </Text>
                ))}
                {statusErrors.length > errors.length ? (
                  <Text style={s.errorText}>그 외 {statusErrors.length - errors.length}곳도 확인이 필요해요.</Text>
                ) : null}
              </View>
            ) : notice ? (
              <Text accessibilityLiveRegion="polite" style={s.statusText}>
                {notice}
              </Text>
            ) : null}
          </SettingsPage>
        </SettingsScroll>
      </SettingsSurface>
      {preview ? (
        <MarketLayoutPreview
          environment={preview.environment}
          initialMode={preview.initialMode}
          onClose={closePreview}
        />
      ) : null}
    </>
  );
}

function GridMap({
  map,
  background,
  width,
  selected,
  onTap
}: {
  map: MarketTilemapV1;
  background: ReturnType<typeof createMarketEnvironment>;
  width: number;
  selected: Selection | null;
  onTap: (x: number, y: number) => void;
}) {
  const grid = getMarketTilemapGrid(map.layoutId);
  const scale = width / grid.width;
  const height = grid.height * scale;
  const rectStyle = (rect: Rect) => ({
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="마트 배치 그리드"
      accessibilityHint="목록에서 선택한 물건을 놓을 칸을 누르세요"
      testID="market-layout-grid"
      style={{ width, height, backgroundColor: '#E2DDCE', overflow: 'hidden' }}
      onPress={(event) => onTap(event.nativeEvent.locationX / scale, event.nativeEvent.locationY / scale)}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {background.walkableAreas.map((area) => (
          <View key={area.id} style={[s.mapRect, rectStyle(area), { backgroundColor: '#FAF6E9' }]} />
        ))}
        {Array.from({ length: grid.columns + 1 }, (_, i) => (
          <View
            key={`x${i}`}
            style={[
              s.gridLine,
              { left: i * grid.cellSize * scale, top: 0, height, width: 0.5, opacity: i % 5 === 0 ? 0.65 : 0.3 }
            ]}
          />
        ))}
        {Array.from({ length: grid.rows + 1 }, (_, i) => (
          <View
            key={`y${i}`}
            style={[
              s.gridLine,
              { top: i * grid.cellSize * scale, left: 0, width, height: 0.5, opacity: i % 5 === 0 ? 0.65 : 0.3 }
            ]}
          />
        ))}
        {background.walls.map((rect, i) => (
          <View key={`wall${i}`} style={[s.mapRect, rectStyle(rect), { backgroundColor: '#A69880' }]} />
        ))}
        {background.objects.map((item) => (
          <View key={item.id} style={[s.fixedObject, rectStyle(item.rect)]} />
        ))}
        {background.constructionZones.map((item) => (
          <View key={item.id} style={[s.mapRect, rectStyle(item.rect), { backgroundColor: '#DDB177', opacity: 0.8 }]} />
        ))}
        {background.checkouts.map((item) => (
          <View key={item.id} style={[s.fixedObject, rectStyle(item.rect)]}>
            <Text numberOfLines={1} style={[s.fixtureLabel, { fontSize: Math.max(9, 32 * scale) }]}>
              {item.kind === 'kiosk' ? '셀프' : '계산대'}
            </Text>
          </View>
        ))}
        {map.shelves.map((item) => {
          const rect = getMarketTilemapFootprint(item);
          const active = sameSelection(selected, { kind: 'shelf', id: item.categoryId });
          return (
            <View key={item.categoryId} style={[s.mapRect, rectStyle(rect), active && s.activeFootprint]}>
              {getMarketShelfUnitRects({ ...rect, orientation: item.orientation }).map((unit, index) => (
                <View
                  key={index}
                  style={[
                    s.shelfUnit,
                    {
                      left: (unit.x - rect.x) * scale,
                      top: (unit.y - rect.y) * scale,
                      width: unit.width * scale,
                      height: unit.height * scale,
                      backgroundColor: CATEGORIES[item.categoryId].color
                    }
                  ]}
                />
              ))}
              <View style={s.shelfLabel}>
                <Text style={[s.fixtureLabel, { fontSize: Math.max(10, 32 * scale) }]}>
                  {CATEGORIES[item.categoryId].short}
                </Text>
              </View>
              {active ? <View style={s.anchorDot} /> : null}
            </View>
          );
        })}
        {map.people.map((item, index) => {
          const center = { x: (item.col + 0.5) * grid.cellSize, y: (item.row + 0.5) * grid.cellSize };
          const size = Math.max(17, 50 * scale);
          const active = sameSelection(selected, { kind: 'person', id: item.id });
          return (
            <View
              key={item.id}
              style={[
                s.personDot,
                active && s.activePerson,
                {
                  left: center.x * scale - size / 2,
                  top: center.y * scale - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: item.kind === 'employee' ? '#527665' : '#9B7793'
                }
              ]}
            >
              <Text style={[s.personNumber, { fontSize: Math.max(9, size * 0.44) }]}>
                {item.kind === 'employee' ? '직' : '손'}
                {map.people.slice(0, index).filter((p) => p.kind === item.kind).length + 1}
              </Text>
            </View>
          );
        })}
        <View style={[s.spawnDot, { left: background.spawn.x * scale - 7, top: background.spawn.y * scale - 7 }]}>
          <Ionicons name="walk" size={14} color="#F8F5E8" />
        </View>
        <Text
          style={[
            s.entranceLabel,
            { left: background.commonDoor.point.x * scale - 28, top: background.commonDoor.point.y * scale - 22 }
          ]}
        >
          공동 출입문
        </Text>
      </View>
    </Pressable>
  );
}

function Button({
  text,
  label,
  icon,
  selected,
  disabled,
  onPress
}: {
  text: string;
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, selected && s.buttonSelected, disabled && s.disabled]}
    >
      {icon ? <Ionicons name={icon} size={18} color={selected ? '#FFFDF6' : c.ink} /> : null}
      <Text style={[s.buttonText, selected && s.buttonTextSelected]}>{text}</Text>
    </PressScale>
  );
}
function Tool({
  label,
  icon,
  disabled,
  onPress
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.tool, disabled && s.disabled]}
    >
      <Ionicons name={icon} size={21} color="#526658" />
    </PressScale>
  );
}
function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={{ fontFamily: fonts.cafe24Ssurround, fontSize: 10, lineHeight: 13, color: '#918D7F' }}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  mapMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 4,
    marginBottom: 8
  },
  metaText: { fontFamily: fonts.cafe24Ssurround, fontSize: 12, lineHeight: 16, color: '#918D7F' },
  figmaMap: { height: 300, overflow: 'hidden', borderRadius: 14, backgroundColor: '#DDDDDD' },
  mapLegend: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 5,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 8
  },
  selectionName: { ...ui.label, textAlign: 'center', marginTop: 10, fontSize: 14, lineHeight: 18 },
  coordinateControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: 4
  },
  directionPad: { width: 84, height: 84, marginLeft: 8 },
  axisFields: { gap: 12, transform: [{ translateY: 4 }] },
  axisRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  axisLabel: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, lineHeight: 18, color: c.muted },
  axisInput: { width: 90, textAlign: 'center' },
  testButton: { ...ui.accordion, alignItems: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  label: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, color: '#5C6757' },
  zoomLabel: { fontFamily: fonts.cafe24Ssurround, fontSize: 12, minWidth: 38, textAlign: 'center', color: '#62705F' },
  inspector: { gap: 10 },
  sectionTitle: { fontFamily: fonts.cafe24Ssurround, fontSize: 16, color: c.label },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
    flexWrap: 'wrap'
  },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: c.field
  },
  buttonSelected: { backgroundColor: c.selected },
  buttonText: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, color: c.ink },
  buttonTextSelected: { color: '#FFFDF6' },
  tool: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: c.field,
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabled: { opacity: 0.38 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 15, height: 15, borderRadius: 5 },
  hint: { fontFamily: fonts.cafe24Ssurround, fontSize: 12, lineHeight: 18, color: c.muted },
  description: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, lineHeight: 22, color: '#687460' },
  jsonPanel: { gap: 12 },
  jsonInput: {
    minHeight: 260,
    maxHeight: 400,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#EFF0E7',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
    color: '#3F5948'
  },
  errorBox: { padding: 13, borderRadius: 14, backgroundColor: '#FAEDE2', gap: 5 },
  errorText: { fontFamily: fonts.cafe24Ssurround, fontSize: 13, lineHeight: 20, color: '#934C3D' },
  statusText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, color: c.selected },
  mapRect: { position: 'absolute' },
  gridLine: { position: 'absolute', backgroundColor: '#B7B6A2' },
  fixedObject: {
    position: 'absolute',
    backgroundColor: '#C9B89C',
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  shelfUnit: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(64,78,54,0.24)', borderRadius: 2 },
  activeFootprint: {
    borderWidth: 2,
    borderColor: '#E1AA44',
    borderRadius: 4,
    backgroundColor: 'rgba(241,202,113,0.2)'
  },
  shelfLabel: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
  fixtureLabel: { fontFamily: fonts.cafe24Ssurround, color: '#344D3D', textAlign: 'center' },
  anchorDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 5,
    height: 5,
    marginLeft: -2.5,
    marginTop: -2.5,
    borderRadius: 3,
    backgroundColor: '#FFF9D7'
  },
  personDot: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  activePerson: { borderWidth: 3, borderColor: '#F3C45C' },
  personNumber: { fontFamily: fonts.cafe24Ssurround, color: '#FFFDF4' },
  spawnDot: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4F7F9A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  entranceLabel: {
    position: 'absolute',
    width: 56,
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 10,
    color: '#61715D',
    textAlign: 'center'
  }
});
