import { test, expect } from 'vitest';
import {
  demoTotals,
  effectiveStatus,
  emptyDemo,
  parseDemo,
  transition,
  numberAllowance,
  validateOrder,
  occupiedNumbers,
  assertNumbersAvailable,
  randomAvailableNumbers,
  TOTAL_NUMBERS,
} from '../src/lib/demo-model.ts';
const payment = { id: 'demo-test-1', amount: 2500, createdAt: 1000, expiresAt: 601000, status: 'pending' };
const data = { ...emptyDemo, payments: [payment] };
test('pagamento pendente não entra no total aprovado', () => {
  expect(demoTotals(data, 2000)).toEqual({ approved: 0, pending: 2500, refunded: 0, count: 0 });
});
test('aprovação duplicada não duplica contribuição', () => {
  const approved = transition(transition(data, payment.id, 'approved', 2000), payment.id, 'approved', 3000);
  expect(demoTotals(approved, 3000)).toEqual({ approved: 2500, pending: 0, refunded: 0, count: 1 });
  expect(approved.payments.length).toBe(1);
});
test('estorno remove o valor aprovado e não pode ser reaprovado', () => {
  const refunded = transition(transition(data, payment.id, 'approved', 2000), payment.id, 'refunded', 3000);
  expect(demoTotals(refunded, 4000)).toEqual({ approved: 0, pending: 0, refunded: 2500, count: 0 });
  expect(transition(refunded, payment.id, 'approved', 5000).payments[0].status).toBe('refunded');
});
test('pagamento expirado não pode ser aprovado', () => {
  expect(effectiveStatus(payment, 601000)).toBe('expired');
  expect(demoTotals(data, 601000).pending).toBe(0);
  expect(effectiveStatus(transition(data, payment.id, 'approved', 601000).payments[0], 601000)).toBe(
    'expired',
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
  const expired = transition(data, payment.id, 'expired', 2000);
  expect(effectiveStatus(expired.payments[0], 3000)).toBe('expired');
  expect(transition(data, 'demo-inexistente', 'approved', 2000)).toEqual(data);
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
  expect(() => validateOrder(500, 'numbers', numbers)).not.toThrow();
  expect(() => validateOrder(500, 'numbers', numbers.slice(1))).toThrow();
  expect(() => validateOrder(500, 'numbers', [...numbers.slice(1), 2])).toThrow();
  expect(() => validateOrder(525, 'numbers', numbers)).toThrow();
  expect(() => validateOrder(500, 'numbers', [...numbers.slice(1), 5001])).toThrow();
  expect(() => validateOrder(500, 'numbers', [...numbers.slice(1), 0])).toThrow();
});
test('colaboração avulsa aceita centavos e nunca inclui números', () => {
  expect(() => validateOrder(7525, 'extra', [])).not.toThrow();
  expect(() => validateOrder(499, 'extra', [])).toThrow();
  expect(() => validateOrder(7525, 'extra', [1])).toThrow();
});
test('reserva é liberada na expiração ou estorno e confirmação mantém ocupação', () => {
  const numbered = { ...payment, mode: 'numbers', numbers: Array.from({ length: 10 }, (_, i) => i + 1) };
  const sample = { ...emptyDemo, payments: [numbered] };
  expect(occupiedNumbers(sample, 2000).size).toBe(10);
  expect(() => assertNumbersAvailable(sample, [1], 2000)).toThrow();
  expect(occupiedNumbers(sample, 601000).size).toBe(0);
  const approved = transition(sample, numbered.id, 'approved', 2000);
  expect(occupiedNumbers(approved, 900000).size).toBe(10);
  expect(occupiedNumbers(transition(approved, numbered.id, 'refunded', 3000), 4000).size).toBe(0);
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
  const a = { ...payment, id: 'demo-a', amount: 500, mode: 'numbers', numbers };
  const b = { ...a, id: 'demo-b' };
  expect(() => transition({ ...emptyDemo, payments: [a, b] }, a.id, 'approved', 2000)).toThrow();
  expect(parseDemo(JSON.stringify({ ...data, payments: [{ ...a, numbers: [1] }] })).payments.length).toBe(0);
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
