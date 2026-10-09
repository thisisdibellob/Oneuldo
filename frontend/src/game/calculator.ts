export type CalculatorOperator = '+' | '−' | '×' | '÷';
export type CalculatorKey = `${number}` | '.' | 'AC' | 'backspace' | 'sign' | '=' | CalculatorOperator;

export type CalculatorState = {
  input: string;
  accumulator: number | null;
  operator: CalculatorOperator | null;
  replaceInput: boolean;
  repeat: { operator: CalculatorOperator; operand: number } | null;
  expression: string;
  error: string | null;
};

export function createCalculatorState(): CalculatorState {
  return { input: '0', accumulator: null, operator: null, replaceInput: false, repeat: null, expression: '', error: null };
}

const operators: readonly string[] = ['+', '−', '×', '÷'];

function calculate(left: number, operator: CalculatorOperator, right: number): number | string {
  if (operator === '÷' && right === 0) return '0으로 나눌 수 없어요';
  const result = operator === '+' ? left + right : operator === '−' ? left - right : operator === '×' ? left * right : left / right;
  if (!Number.isFinite(result) || Math.abs(result) > 999_999_999_999) return '숫자가 너무 커요';
  // A pocket calculator has finite precision. Avoid exposing binary artifacts such as 0.1 + 0.2.
  return Number(result.toPrecision(12));
}

function failed(message: string): CalculatorState {
  return { ...createCalculatorState(), error: message, replaceInput: true };
}

/** A basic pocket calculator: chained operations are performed from left to right. */
export function pressCalculatorKey(previous: CalculatorState, key: CalculatorKey): CalculatorState {
  if (key === 'AC') return createCalculatorState();
  const state = previous.error ? createCalculatorState() : previous;

  if (/^[0-9]$/.test(key) || key === '.') {
    let input = state.replaceInput ? '0' : state.input;
    if (key === '.') {
      if (input.includes('.')) return state;
      input += '.';
    } else {
      if (input.replace(/[^0-9]/g, '').length >= 12 && input !== '0') return state;
      input = input === '0' ? key : input === '-0' ? `-${key}` : input + key;
    }
    return { ...state, input, replaceInput: false, repeat: null, expression: state.operator ? state.expression : '' };
  }

  if (key === 'backspace') {
    if (state.replaceInput) return { ...state, input: '0', replaceInput: false, repeat: null, expression: state.operator ? state.expression : '' };
    const shortened = state.input.slice(0, -1);
    return { ...state, input: !shortened || shortened === '-' ? '0' : shortened, repeat: null };
  }

  if (key === 'sign') {
    const input = state.replaceInput && state.operator ? '-0' : state.input.startsWith('-') ? state.input.slice(1) : `-${state.input}`;
    return { ...state, input, replaceInput: false, repeat: null, expression: state.operator ? state.expression : '' };
  }

  if (operators.includes(key)) {
    const operator = key as CalculatorOperator;
    let accumulator = Number(state.input);
    if (state.operator && state.accumulator !== null) {
      if (state.replaceInput) accumulator = state.accumulator;
      else {
        const result = calculate(state.accumulator, state.operator, accumulator);
        if (typeof result === 'string') return failed(result);
        accumulator = result;
      }
    }
    return { ...state, accumulator, input: String(accumulator), operator, replaceInput: true, repeat: null, expression: `${accumulator} ${operator}` };
  }

  if (key === '=') {
    const operator = state.operator ?? state.repeat?.operator;
    if (!operator) return state;
    const left = state.operator ? state.accumulator ?? Number(state.input) : Number(state.input);
    const right = state.operator ? Number(state.input) : state.repeat!.operand;
    const result = calculate(left, operator, right);
    if (typeof result === 'string') return failed(result);
    return { input: String(result), accumulator: null, operator: null, replaceInput: true, repeat: { operator, operand: right }, expression: `${left} ${operator} ${right} =`, error: null };
  }

  return state;
}
