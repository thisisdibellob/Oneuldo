import { createCalculatorState, pressCalculatorKey } from '../src/game/calculator';
import type { CalculatorKey } from '../src/game/calculator';

const press = (...keys: CalculatorKey[]) => keys.reduce(pressCalculatorKey, createCalculatorState());

describe('장보기 휴대폰 계산기', () => {
  it('직접 입력한 단가와 개수로 금액을 계산하고 차액을 이어 계산한다', () => {
    const total = press('2', '4', '0', '0', '×', '3', '=');
    expect(total.input).toBe('7200');
    const remaining = ['AC', '1', '0', '0', '0', '0', '−', '7', '2', '0', '0', '='].reduce((state, key) => pressCalculatorKey(state, key as CalculatorKey), total);
    expect(remaining.input).toBe('2800');
  });

  it('사칙 연산은 입력한 순서로 계산하며 연산자 교체와 반복 등호를 처리한다', () => {
    expect(press('8', '+', '2', '×', '3', '=').input).toBe('30');
    expect(press('8', '+', '÷', '2', '=').input).toBe('4');
    expect(press('5', '+', '2', '=', '=').input).toBe('9');
    expect(press('5', '+', '2', '=', '3').input).toBe('3');
  });

  it('소수점 중복을 막고 소수 계산 오차와 한 자리 삭제를 처리한다', () => {
    expect(press('0', '.', '1', '+', '0', '.', '2', '=').input).toBe('0.3');
    expect(press('1', '.', '.', '2', '3', 'backspace').input).toBe('1.2');
    expect(press('3', 'sign', 'backspace').input).toBe('0');
    expect(press('9', '×', 'sign', '2', '=').input).toBe('-18');
  });

  it('0 나누기나 표시 범위를 넘은 결과는 안내 후 새 입력으로 회복한다', () => {
    const failed = press('7', '÷', '0', '=');
    expect(failed.error).toBe('0으로 나눌 수 없어요');
    expect(pressCalculatorKey(failed, '4')).toMatchObject({ input: '4', error: null });
    expect(press('9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '+', '1', '=').error).toBe('숫자가 너무 커요');
    expect(pressCalculatorKey(failed, 'AC')).toEqual(createCalculatorState());
  });
});
