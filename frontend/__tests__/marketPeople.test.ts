import { createMarketEnvironment } from '../src/game/marketEnvironment';
import { getMarketPersonAppearance, MARKET_CUSTOMER_APPEARANCES, MARKET_EMPLOYEE_APPEARANCES } from '../src/game/marketPeople';

it('다양한 게임에서 종업원 4종과 연령·성별별 손님 12종 모두 등장하고 같은 역할 안에서 중복되지 않는다', () => {
  const employees = new Set<string>();
  const customers = new Set<string>();
  for (let seed = 0; seed < 100; seed += 1) {
    const environment = createMarketEnvironment({ seed, employeeCount: 3, customerCount: 5, cashierCount: 2 });
    expect(new Set(environment.employees.map(person => person.appearanceId)).size).toBe(3);
    expect(new Set(environment.customers.map(person => person.appearanceId)).size).toBe(5);
    for (const person of [...environment.employees, ...environment.customers]) {
      const appearance = getMarketPersonAppearance(person.kind, person.appearance);
      expect(person.appearanceId).toBe(appearance.id);
      (person.kind === 'employee' ? employees : customers).add(appearance.id);
    }
    expect(environment.checkouts[0].cashierAppearance).not.toBe(environment.checkouts[1].cashierAppearance);
    expect(createMarketEnvironment(environment.config)).toEqual(environment);
  }
  expect(employees).toEqual(new Set(MARKET_EMPLOYEE_APPEARANCES.map(appearance => appearance.id)));
  expect(customers).toEqual(new Set(MARKET_CUSTOMER_APPEARANCES.map(appearance => appearance.id)));
  for (const gender of ['male', 'female']) {
    expect(MARKET_EMPLOYEE_APPEARANCES.filter(appearance => appearance.gender === gender)).toHaveLength(2);
    for (const age of ['adult', 'senior', 'child']) {
      expect(MARKET_CUSTOMER_APPEARANCES.filter(appearance => appearance.gender === gender && appearance.age === age)).toHaveLength(2);
    }
  }
});

it('이전 숫자 외형 값도 안정적으로 표시할 수 있다', () => {
  expect(getMarketPersonAppearance('employee', 4).id).toBe('employee-male-01');
  expect(getMarketPersonAppearance('customer', 11).id).toBe('customer-child-female-02');
});
