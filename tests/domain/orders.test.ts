import { test, expect } from 'vitest';
import {
  TOTAL_NUMBERS,
  assertNumbersAvailable,
  completeWithAvailable,
  effectiveStatus,
  formatNumber,
  numberAllowance,
  occupiedNumbers,
  orderTotals,
  randomAvailableNumbers,
  transition,
  validateOrder,
  type OrderSnapshot,
} from '@/domain/orders';
import { formatBRL, parseBRLToCents } from '@/domain/money';
// O formato salvo no navegador pelo protótipo continua em demo-model; os casos de armazenamento usam ele.
import { emptyDemo, parseDemo, type DemoPayment } from '@/lib/demo-model';

const at = (ms: number) => new Date(ms);
const order: OrderSnapshot = {
  id: 'order-test-1',
  amountCents: 2500,
  status: 'PENDING',
  expiresAt: at(601000),
  numbers: [],
};
const orders = [order];
const numbersProduct = { mode: 'NUMBERS', active: true } as const;
const extraProduct = { mode: 'EXTRA', active: true } as const;
const free = new Set<number>();
const payment: DemoPayment = {
  id: 'demo-test-1',
  amount: 2500,
  createdAt: 1000,
  expiresAt: 601000,
  status: 'pending',
};
const data = { ...emptyDemo, payments: [payment] };

test('pagamento pendente não entra no total aprovado', () => {
  expect(orderTotals(orders, at(2000))).toEqual({ approved: 0, pending: 2500, refunded: 0, count: 0 });
});
test('aprovação duplicada não duplica contribuição', () => {
  const approved = transition(
    transition(orders, order.id, 'APPROVED', at(2000)),
    order.id,
    'APPROVED',
    at(3000),
  );
  expect(orderTotals(approved, at(3000))).toEqual({ approved: 2500, pending: 0, refunded: 0, count: 1 });
  expect(approved.length).toBe(1);
});
test('estorno remove o valor aprovado e não pode ser reaprovado', () => {
  const refunded = transition(
    transition(orders, order.id, 'APPROVED', at(2000)),
    order.id,
    'REFUNDED',
    at(3000),
  );
  expect(orderTotals(refunded, at(4000))).toEqual({ approved: 0, pending: 0, refunded: 2500, count: 0 });
  expect(transition(refunded, order.id, 'APPROVED', at(5000))[0].status).toBe('REFUNDED');
});
test('pagamento expirado não pode ser aprovado', () => {
  expect(effectiveStatus(order, at(601000))).toBe('EXPIRED');
  expect(orderTotals(orders, at(601000)).pending).toBe(0);
  expect(effectiveStatus(transition(orders, order.id, 'APPROVED', at(601000))[0], at(601000))).toBe(
    'EXPIRED',
  );
});
test('armazenamento inválido é tratado e campos pessoais não são carregados', () => {
  expect(parseDemo('{broken')).toEqual(emptyDemo);
  expect(
    parseDemo(JSON.stringify({ ...data, payments: [{ ...payment, amount: -10 }] })).payments.length,
  ).toBe(0);
  const restored = parseDemo(
    JSON.stringify({ ...data, payments: [{ ...payment, cpf: '000', email: 'teste@example.com' }] }),
  );
  expect('cpf' in restored.payments[0]).toBe(false);
  expect('email' in restored.payments[0]).toBe(false);
});
test('simular expiração é terminal e registro desconhecido não muda os outros', () => {
  const expired = transition(orders, order.id, 'EXPIRED', at(2000));
  expect(effectiveStatus(expired[0], at(3000))).toBe('EXPIRED');
  expect(transition(expired, order.id, 'APPROVED', at(3000))[0].status).toBe('EXPIRED');
  expect(transition(orders, 'order-inexistente', 'APPROVED', at(2000))).toEqual(orders);
});

test('pacotes seguem R$ 5 para 10 números e exigem seleção exata', () => {
  for (const [amount, count] of [
    [500, 10],
    [1000, 20],
    [2500, 50],
    [5000, 100],
  ])
    expect(numberAllowance(amount)).toBe(count);
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  const check = (amount: number, chosen: number[]) => () =>
    validateOrder(amount, 'NUMBERS', chosen, free, numbersProduct);
  expect(check(500, numbers)).not.toThrow();
  expect(check(500, numbers.slice(1))).toThrow();
  expect(check(500, [...numbers.slice(1), 2])).toThrow();
  expect(check(525, numbers)).toThrow();
  expect(check(500, [...numbers.slice(1), 5001])).toThrow();
  expect(check(500, [...numbers.slice(1), 0])).toThrow();
});
test('colaboração avulsa aceita centavos e nunca inclui números', () => {
  expect(() => validateOrder(7525, 'EXTRA', [], free, extraProduct)).not.toThrow();
  expect(() => validateOrder(499, 'EXTRA', [], free, extraProduct)).toThrow();
  expect(() => validateOrder(7525, 'EXTRA', [1], free, extraProduct)).toThrow();
});
test('reserva é liberada na expiração ou estorno e confirmação mantém ocupação', () => {
  const numbered = { ...order, numbers: Array.from({ length: 10 }, (_, i) => i + 1) };
  const sample = [numbered];
  expect(occupiedNumbers(sample, at(2000)).size).toBe(10);
  expect(() => assertNumbersAvailable(sample, [1], at(2000))).toThrow();
  expect(occupiedNumbers(sample, at(601000)).size).toBe(0);
  const approved = transition(sample, numbered.id, 'APPROVED', at(2000));
  expect(occupiedNumbers(approved, at(900000)).size).toBe(10);
  expect(occupiedNumbers(transition(approved, numbered.id, 'REFUNDED', at(3000)), at(4000)).size).toBe(0);
});
test('dados antigos são migrados para avulsa e catálogo não duplica por pedido', () => {
  const restored = parseDemo(JSON.stringify(data));
  expect(restored.payments[0].mode).toBe('extra');
  expect(restored.payments[0].productId).toBe('colaboracao-avulsa');
  expect(restored.products.length).toBe(2);
  const numbered = {
    ...payment,
    id: 'demo-numbers',
    amount: 500,
    mode: 'numbers',
    numbers: Array.from({ length: 10 }, (_, i) => i + 101),
    productId: 'forjado',
  };
  const refreshed = parseDemo(
    JSON.stringify({ ...data, payments: [numbered, payment], products: [{ id: 'malicioso' }] }),
  );
  expect(refreshed.products.length).toBe(2);
  expect(refreshed.payments[0].productId).toBe('cestas-boticario');
  expect(refreshed.payments[0].numbers).toEqual(numbered.numbers);
});
test('aprovação de reserva conflitante falha e pedido inválido não é carregado', () => {
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  const a = { ...order, id: 'order-a', amountCents: 500, numbers };
  const b = { ...a, id: 'order-b' };
  expect(() => transition([a, b], a.id, 'APPROVED', at(2000))).toThrow();
  const stored = { ...payment, id: 'demo-a', amount: 500, mode: 'numbers', numbers: [1] };
  expect(parseDemo(JSON.stringify({ ...data, payments: [stored] })).payments.length).toBe(0);
});

test('seleção aleatória entrega quantidade exata, sem repetição nem números ocupados', () => {
  const occupied = new Set([1, 2, 3, 4, 5, 101, 5000]);
  const chosen = randomAvailableNumbers(20, occupied, () => 0.72);
  expect(chosen.length).toBe(20);
  expect(new Set(chosen).size).toBe(20);
  expect(
    chosen.every((number) => number >= 1 && number <= TOTAL_NUMBERS && !occupied.has(number)),
  ).toBeTruthy();
  expect(chosen).not.toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
  const onlyThreeFree = new Set(Array.from({ length: TOTAL_NUMBERS - 3 }, (_, i) => i + 1));
  expect(randomAvailableNumbers(3, onlyThreeFree, () => 0)).toEqual([4998, 4999, 5000]);
  expect(() => randomAvailableNumbers(4, onlyThreeFree)).toThrow();
});

// Casos novos da T05: parâmetros que a regra ganhou ao sair do protótipo.
test('pedido exige produto ativo do mesmo modo e números livres', () => {
  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  expect(() => validateOrder(500, 'NUMBERS', numbers, new Set([3]), numbersProduct)).toThrow();
  expect(() => validateOrder(500, 'NUMBERS', numbers, free, { mode: 'NUMBERS', active: false })).toThrow();
  expect(() => validateOrder(500, 'NUMBERS', numbers, free, extraProduct)).toThrow();
  expect(() => validateOrder(500, 'NUMBERS', numbers, new Set([11]), numbersProduct)).not.toThrow();
});
test('cancelamento só vale para pendente e libera os números', () => {
  const numbered = { ...order, numbers: [7, 8] };
  const canceled = transition([numbered], numbered.id, 'CANCELED', at(2000));
  expect(canceled[0].status).toBe('CANCELED');
  expect(occupiedNumbers(canceled, at(3000)).size).toBe(0);
  expect(transition(canceled, numbered.id, 'APPROVED', at(3000))[0].status).toBe('CANCELED');
  const approved = transition([numbered], numbered.id, 'APPROVED', at(2000));
  expect(transition(approved, numbered.id, 'CANCELED', at(3000))[0].status).toBe('APPROVED');
});
test('completar mantém os escolhidos livres e usa os menores disponíveis', () => {
  expect(completeWithAvailable([2, 9], 4, new Set([1, 2]))).toEqual([3, 4, 5, 9]);
  expect(completeWithAvailable([], 0, free)).toEqual([]);
  expect(formatNumber(7)).toBe('0007');
  expect(formatNumber(5000)).toBe('5000');
});
test('dinheiro é formatado em reais e lido de volta em centavos inteiros', () => {
  expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  expect(parseBRLToCents('R$ 1.234,56')).toBe(123456);
  expect(parseBRLToCents('5')).toBe(500);
  expect(parseBRLToCents('7,2')).toBe(720);
  expect(parseBRLToCents('1.000')).toBe(100000);
  expect(parseBRLToCents('19.99')).toBe(1999);
  expect(parseBRLToCents('0,29')).toBe(29);
  for (const invalid of ['', 'abc', '-5', '1,234', '1.2.3', '5,'])
    expect(parseBRLToCents(invalid)).toBeNull();
});
