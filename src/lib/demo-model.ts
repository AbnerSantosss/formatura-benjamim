export type DemoStatus = 'pending' | 'approved' | 'expired' | 'refunded';
export type DemoPayment = { id: string; amount: number; createdAt: number; expiresAt: number; status: DemoStatus };
export type DemoData = { version: 1; goal: number; payments: DemoPayment[] };
export const emptyDemo: DemoData = { version: 1, goal: 250000, payments: [] };
export const statusLabels: Record<DemoStatus, string> = { pending: 'Pendente', approved: 'Aprovado', expired: 'Expirado', refunded: 'Estornado' };

export function parseDemo(raw: string | null): DemoData {
  try {
    const data = JSON.parse(raw || '{}');
    if (data.version !== 1 || !Number.isSafeInteger(data.goal) || data.goal < 100 || !Array.isArray(data.payments)) return emptyDemo;
    const payments: DemoPayment[] = data.payments.filter((p: DemoPayment) =>
      typeof p?.id === 'string' && /^demo-[a-z0-9-]+$/.test(p.id) && [500, 1000, 2500, 5000].includes(p.amount) &&
      Number.isFinite(p.createdAt) && Number.isFinite(p.expiresAt) && Object.hasOwn(statusLabels, p.status)
    ).slice(0, 100).map((p: DemoPayment) => ({ id: p.id, amount: p.amount, createdAt: p.createdAt, expiresAt: p.expiresAt, status: p.status }));
    return { version: 1, goal: data.goal, payments };
  } catch { return emptyDemo; }
}

export function effectiveStatus(payment: DemoPayment, now: number): DemoStatus {
  return payment.status === 'pending' && now >= payment.expiresAt ? 'expired' : payment.status;
}

// Only pending -> approved/expired and approved -> refunded are demo actions.
export function transition(data: DemoData, id: string, next: DemoStatus, now: number): DemoData {
  return { ...data, payments: data.payments.map(payment => {
    if (payment.id !== id) return payment;
    const current = effectiveStatus(payment, now);
    const allowed = (current === 'pending' && ['approved', 'expired'].includes(next)) || (current === 'approved' && next === 'refunded');
    return allowed ? { ...payment, status: next } : payment;
  }) };
}

export function demoTotals(data: DemoData, now: number) {
  return data.payments.reduce((total, payment) => {
    const status = effectiveStatus(payment, now);
    if (status === 'approved') { total.approved += payment.amount; total.count += 1; }
    if (status === 'pending') total.pending += payment.amount;
    if (status === 'refunded') total.refunded += payment.amount;
    return total;
  }, { approved: 0, pending: 0, refunded: 0, count: 0 });
}
