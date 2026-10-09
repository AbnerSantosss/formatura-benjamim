// Regras puras de pedidos e números. Sem navegador, sem banco e sem relógio próprio:
// `now` sempre chega por parâmetro.
import type { OrderMode, OrderStatus } from './types';

export const TOTAL_NUMBERS = 5000;
/** R$ 0,50 por número: R$ 5 = 10 números. */
export const NUMBER_UNIT_CENTS = 50;
export const PACKAGE_CENTS = 500;
export const RESERVATION_MINUTES = 10;
export const SUGGESTED_AMOUNTS = [500, 1000, 2500, 5000] as const;
export const MIN_ORDER_CENTS = 500;
export const MAX_ORDER_CENTS = 100000000;

/** Retrato mínimo de um pedido para as regras de status e ocupação. */
export type OrderSnapshot = {
  id: string;
  amountCents: number;
  status: OrderStatus;
  expiresAt: Date;
  numbers: number[];
};
export type OrderProduct = { mode: OrderMode; active: boolean };

export const formatNumber = (number: number) => String(number).padStart(String(TOTAL_NUMBERS).length, '0');

export function numberAllowance(amount: number) {
  return amount >= 500 && amount % 500 === 0 ? amount / NUMBER_UNIT_CENTS : 0;
}

export function randomAvailableNumbers(count: number, occupied: Set<number>, random = Math.random) {
  if (!Number.isInteger(count) || count < 1) return [];
  const pool = Array.from({ length: TOTAL_NUMBERS }, (_, index) => index + 1).filter(
    (number) => !occupied.has(number),
  );
  if (count > pool.length) throw new Error('Não há números disponíveis suficientes para este pacote.');
  // Fisher-Yates parcial: amostra sem reposição sobre toda a lista de livres.
  for (let index = 0; index < count; index++) {
    const pick = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[pick]] = [pool[pick], pool[index]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** Mantém os escolhidos ainda livres e completa com os menores números disponíveis. */
export function completeWithAvailable(selected: number[], allowance: number, occupied: Set<number>) {
  const chosen = selected.filter((number) => !occupied.has(number)).slice(0, allowance);
  for (let number = 1; number <= TOTAL_NUMBERS && chosen.length < allowance; number++)
    if (!occupied.has(number) && !chosen.includes(number)) chosen.push(number);
  return chosen.sort((a, b) => a - b);
}

export function validateOrder(
  amount: number,
  mode: OrderMode,
  numbers: number[],
  occupied: Set<number>,
  product: OrderProduct,
) {
  if (!Number.isSafeInteger(amount) || amount < MIN_ORDER_CENTS || amount > MAX_ORDER_CENTS)
    throw new Error('Informe um valor a partir de R$ 5.');
  if (!product.active) throw new Error('Este produto não está disponível no momento.');
  if (product.mode !== mode) throw new Error('O produto escolhido não aceita este tipo de pedido.');
  if (mode === 'EXTRA') {
    if (numbers.length) throw new Error('Colaboração avulsa não inclui números.');
    return;
  }
  const allowance = numberAllowance(amount);
  if (!allowance || allowance > TOTAL_NUMBERS)
    throw new Error('Escolha pacotes de R$ 5: cada pacote dá 10 números.');
  if (
    numbers.length !== allowance ||
    new Set(numbers).size !== numbers.length ||
    numbers.some((number) => !Number.isInteger(number) || number < 1 || number > TOTAL_NUMBERS)
  )
    throw new Error(`Escolha exatamente ${allowance} números diferentes.`);
  if (numbers.some((number) => occupied.has(number)))
    throw new Error('Alguns números já estão reservados. Escolha outros.');
}

/** Expiração preguiçosa: pendente vira expirado quando `now >= expiresAt`. */
export function effectiveStatus(order: Pick<OrderSnapshot, 'status' | 'expiresAt'>, now: Date): OrderStatus {
  return order.status === 'PENDING' && now.getTime() >= order.expiresAt.getTime() ? 'EXPIRED' : order.status;
}

/** Números de pedidos pendentes (não expirados) ou aprovados. */
export function occupiedNumbers(orders: OrderSnapshot[], now: Date, excludeId?: string) {
  return new Set(
    orders
      .filter(
        (order) => order.id !== excludeId && ['PENDING', 'APPROVED'].includes(effectiveStatus(order, now)),
      )
      .flatMap((order) => order.numbers),
  );
}

export function assertNumbersAvailable(
  orders: OrderSnapshot[],
  numbers: number[],
  now: Date,
  excludeId?: string,
) {
  const occupied = occupiedNumbers(orders, now, excludeId);
  if (numbers.some((number) => occupied.has(number)))
    throw new Error('Alguns números já estão reservados. Escolha outros.');
}

/**
 * Máquina de estados: PENDING -> APPROVED | EXPIRED | CANCELED e APPROVED -> REFUNDED.
 * Aprovar revalida a disponibilidade dos números; qualquer outra transição é ignorada (idempotente).
 */
export function transition<T extends OrderSnapshot>(
  orders: T[],
  id: string,
  next: OrderStatus,
  now: Date,
): T[] {
  const target = orders.find((order) => order.id === id);
  if (target && next === 'APPROVED' && effectiveStatus(target, now) === 'PENDING')
    assertNumbersAvailable(orders, target.numbers, now, id);
  return orders.map((order) => {
    if (order.id !== id) return order;
    const current = effectiveStatus(order, now);
    const allowed =
      (current === 'PENDING' && ['APPROVED', 'EXPIRED', 'CANCELED'].includes(next)) ||
      (current === 'APPROVED' && next === 'REFUNDED');
    return allowed ? { ...order, status: next } : order;
  });
}

/** Só aprovado conta no arrecadado; pendente e estornado ficam separados. */
export function orderTotals(orders: OrderSnapshot[], now: Date) {
  return orders.reduce(
    (total, order) => {
      const status = effectiveStatus(order, now);
      if (status === 'APPROVED') {
        total.approved += order.amountCents;
        total.count += 1;
      }
      if (status === 'PENDING') total.pending += order.amountCents;
      if (status === 'REFUNDED') total.refunded += order.amountCents;
      return total;
    },
    { approved: 0, pending: 0, refunded: 0, count: 0 },
  );
}
