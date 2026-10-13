import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { MarketInteriorBackdrop, MarketShelfTarget, MarketCheckoutFixture, MarketPersonFixture } from '../src/components/game/MarketInteriorLayer';
import { MarketThemeSelector } from '../src/components/game/MarketThemeSelector';
import { createMarketEnvironment, isMarketEnvironmentBlocked } from '../src/game/marketEnvironment';
import { getGamePreferences, resetGamePreferencesForTests, updateGamePreferences } from '../src/game/gamePreferences';
import { cozyMarketArt } from '../src/game/marketInteriorThemeArt';
import { marketCategories } from '../src/game/scenarios';

jest.mock('expo-font', () => ({ isLoaded: () => true, loadAsync: () => Promise.resolve() }));
beforeEach(() => resetGamePreferencesForTests());

it('changes the furniture art live while retaining the exact stock, people, shelf targets and geometry', () => {
  const environment = createMarketEnvironment({ seed: 'theme-preserves-world', employeeCount: 1, cashierCount: 2, kioskLane: 'none' });
  const modelBefore = JSON.stringify(environment);
  const screen = render(<View>
    <MarketThemeSelector reduceMotion />
    <MarketInteriorBackdrop environment={environment} />
    {marketCategories.map(category => <MarketShelfTarget key={category.id} categoryId={category.id}
      placement={environment.shelves[category.id]} active={false} onPress={jest.fn()} accessibilityLabel={category.label} />)}
    <MarketCheckoutFixture active={false} counter={environment.checkouts[0]} />
    <MarketPersonFixture person={environment.employees[0]} />
  </View>);
  const ids = screen.queryAllByTestId(/^market-facing-/).map(element => element.props.testID);
  const items = () => ids.map(id => ({ source: screen.getByTestId(id).props.source, style: StyleSheet.flatten(screen.getByTestId(id).props.style) }));
  const targets = () => screen.queryAllByTestId(/^market-shelf-touch-/, { includeHiddenElements: true }).map(element => StyleSheet.flatten(element.props.style));
  const art = () => screen.getByTestId('market-shelf-art-drink-1').props.source;
  const people = () => screen.queryAllByTestId(/^market-(cashier|person)-art-/).map(element => element.props.source);
  const previous = { items: items(), targets: targets(), people: people(), art: art() };
  const points = [{ x: 600, y: 1100 }, { x: 20, y: 20 }, environment.spawn, environment.checkouts[0].point];
  const blocked = points.map(point => isMarketEnvironmentBlocked(environment, point));
  fireEvent.press(screen.getByRole('radio', { name: '동네 마트' }));
  expect(getGamePreferences().marketInteriorTheme).toBe('cozy');
  expect(art()).toEqual(cozyMarketArt.gondola);
  expect(screen.getByTestId('market-shelf-art-fresh-1').props.source).toEqual(cozyMarketArt.fridge);
  expect(screen.getByTestId('market-shelf-art-produce-1').props.source).toEqual(cozyMarketArt.produce);
  expect(screen.getByTestId('market-checkout-art').props.source).toEqual(cozyMarketArt.checkout);
  expect(items()).toEqual(previous.items);
  expect(targets()).toEqual(previous.targets);
  expect(people()).toEqual(previous.people);
  expect(screen.getAllByTestId('market-maple-floor', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  expect(points.map(point => isMarketEnvironmentBlocked(environment, point))).toEqual(blocked);
  expect(JSON.stringify(environment)).toBe(modelBefore);
  fireEvent.press(screen.getByRole('radio', { name: '기본 마트' }));
  expect(art()).toEqual(previous.art);
  expect(screen.queryAllByTestId('market-maple-floor', { includeHiddenElements: true })).toHaveLength(0);
  expect(items()).toEqual(previous.items);
});

it.each(['classic', 'aisles', 'corner'] as const)('retains the wall and door anchors in the %s layout', layoutId => {
  const environment = createMarketEnvironment({ layoutId, seed: 'theme-layouts' });
  const screen = render(<MarketInteriorBackdrop environment={environment} />);
  const positions = () => screen.queryAllByTestId(/^market-(floor-|wall-|common-door-frame|alarm-gate-)/, { includeHiddenElements: true })
    .filter(node => !node.props.testID.includes('floor-row-')).map(node => {
      const { left, top, width, height } = StyleSheet.flatten(node.props.style);
      return { id: node.props.testID, left, top, width, height };
    });
  const before = positions();
  act(() => updateGamePreferences({ marketInteriorTheme: 'cozy' }));
  expect(positions()).toEqual(before);
});
