// As regras puras moraram aqui no protótipo e agora vivem em `src/domain/`.
// Este arquivo reexporta o domínio e mantém só o formato do protótipo (localStorage, status e
// modos em minúsculas, horários em milissegundos) que os componentes ainda importam.
// As declarações locais abaixo têm precedência sobre os nomes iguais vindos de `export *`.
export * from '@/domain/orders';
export * from '@/domain/money';
import { NUMBER_UNIT_CENTS, validateOrder as validateDomainOrder } from '@/domain/orders';

export type DemoStatus = 'pending' | 'approved' | 'expired' | 'refunded';
export type OrderMode = 'numbers' | 'extra';
export type DemoProduct = {
  id: string;
  title: string;
  mode: OrderMode;
  description: string;
  unitPrice: number | null;
};
// Fixed catalog: created automatically in the demo, without duplicate products per order.
export const demoProducts: DemoProduct[] = [
  {
    id: 'cestas-boticario',
    title: 'Cestas Boticário — participação no sorteio',
    mode: 'numbers',
    description:
      'Cestas masculina e feminina. Seleção de números em uma demonstração sem cobrança ou sorteio real.',
    unitPrice: NUMBER_UNIT_CENTS,
  },
  {
    id: 'colaboracao-avulsa',
    title: 'Colaboração avulsa — formatura do Benjamim',
    mode: 'extra',
    description: 'Valor livre a partir de R$ 5, sem números ou participação no sorteio.',
    unitPrice: null,
  },
];
export type DemoPayment = {
  id: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
  status: DemoStatus;
  mode?: OrderMode;
  productId?: string;
  numbers?: number[];
};
export type DemoData = { version: 1; goal: number; payments: DemoPayment[]; products: DemoProduct[] };
export const emptyDemo: DemoData = { version: 1, goal: 250000, payments: [], products: demoProducts };
export const statusLabels: Record<DemoStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  expired: 'Expirado',
  refunded: 'Estornado',
};
export const modeLabels: Record<OrderMode, string> = {
  numbers: 'Números das cestas',
  extra: 'Colaboração avulsa',
};
export const productFor = (mode: OrderMode) => demoProducts.find((product) => product.mode === mode)!;
export const paymentProduct = (payment: DemoPayment) => productFor(payment.mode || 'extra');
const domainMode = { numbers: 'NUMBERS', extra: 'EXTRA' } as const;
const noOccupied = new Set<number>();
// No protótipo o produto é sempre o do próprio modo e a disponibilidade é conferida à parte
// (`assertNumbersAvailable`), então a regra do domínio recebe produto ativo e nenhum ocupado.
export function validateOrder(amount: number, mode: OrderMode, numbers: number[]) {
  validateDomainOrder(amount, domainMode[mode], numbers, noOccupied, {
    mode: domainMode[mode],
    active: true,
  });
}
export function parseDemo(raw: string | null): DemoData {
  try {
    const data = JSON.parse(raw || '{}');
    if (
      data.version !== 1 ||
      !Number.isSafeInteger(data.goal) ||
      data.goal < 100 ||
      !Array.isArray(data.payments)
    )
      return emptyDemo;
    const payments: DemoPayment[] = data.payments
      .flatMap((p: DemoPayment) => {
        if (
          typeof p?.id !== 'string' ||
          !/^demo-[a-z0-9-]+$/.test(p.id) ||
          !Number.isFinite(p.createdAt) ||
          !Number.isFinite(p.expiresAt) ||
          !Object.hasOwn(statusLabels, p.status)
        )
          return [];
        const mode = p.mode === undefined ? 'extra' : p.mode;
        if (!['numbers', 'extra'].includes(mode)) return [];
        const numbers = Array.isArray(p.numbers) ? p.numbers : [];
        try {
          validateOrder(p.amount, mode, numbers);
        } catch {
          return [];
        }
        return [
          {
            id: p.id,
            amount: p.amount,
            createdAt: p.createdAt,
            expiresAt: p.expiresAt,
            status: p.status,
            mode,
            productId: productFor(mode).id,
            numbers: [...numbers].sort((a, b) => a - b),
          },
        ];
      })
      .slice(0, 1000);
    return { version: 1, goal: data.goal, payments, products: demoProducts };
  } catch {
    return emptyDemo;
  }
}
export function effectiveStatus(payment: DemoPayment, now: number): DemoStatus {
  return payment.status === 'pending' && now >= payment.expiresAt ? 'expired' : payment.status;
}
export function occupiedNumbers(data: DemoData, now: number, excludeId?: string) {
  return new Set(
    data.payments
      .filter(
        (payment) =>
          payment.id !== excludeId && ['pending', 'approved'].includes(effectiveStatus(payment, now)),
      )
      .flatMap((payment) => payment.numbers || []),
  );
}
export function assertNumbersAvailable(data: DemoData, numbers: number[], now: number, excludeId?: string) {
  const occupied = occupiedNumbers(data, now, excludeId);
  if (numbers.some((number) => occupied.has(number)))
    throw new Error('Alguns números já estão reservados neste navegador. Escolha outros.');
}
export function transition(data: DemoData, id: string, next: DemoStatus, now: number): DemoData {
  const target = data.payments.find((payment) => payment.id === id);
  if (target && next === 'approved' && effectiveStatus(target, now) === 'pending')
    assertNumbersAvailable(data, target.numbers || [], now, id);
  return {
    ...data,
    payments: data.payments.map((payment) => {
      if (payment.id !== id) return payment;
      const current = effectiveStatus(payment, now);
      const allowed =
        (current === 'pending' && ['approved', 'expired'].includes(next)) ||
        (current === 'approved' && next === 'refunded');
      return allowed ? { ...payment, status: next } : payment;
    }),
  };
}
export function demoTotals(data: DemoData, now: number) {
  return data.payments.reduce(
    (total, payment) => {
      const status = effectiveStatus(payment, now);
      if (status === 'approved') {
        total.approved += payment.amount;
        total.count += 1;
      }
      if (status === 'pending') total.pending += payment.amount;
      if (status === 'refunded') total.refunded += payment.amount;
      return total;
    },
    { approved: 0, pending: 0, refunded: 0, count: 0 },
  );
}
