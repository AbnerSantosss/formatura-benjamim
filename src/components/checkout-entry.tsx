'use client';
import { useSearchParams } from 'next/navigation';
import Checkout from './checkout';
import { resolveAmount } from '@/lib/campaign';
import {
  MAX_ORDER_CENTS,
  MIN_ORDER_CENTS,
  NUMBER_UNIT_CENTS,
  TOTAL_NUMBERS,
  numberAllowance,
} from '@/domain/orders';
import { parseBRLToCents } from '@/domain/money';

/** `?numeros=1,2,3`: inteiros de 1 a 5000, sem repetição, em ordem crescente. Qualquer item inválido é ignorado. */
function parseNumbers(value: string | null) {
  if (!value) return [];
  const numbers = value
    .split(',')
    .map((item) => (/^\d{1,4}$/.test(item.trim()) ? Number(item.trim()) : 0))
    .filter((number) => number >= 1 && number <= TOTAL_NUMBERS);
  return [...new Set(numbers)].sort((a, b) => a - b);
}

export default function CheckoutEntry() {
  const params = useSearchParams();
  const mode = params.get('modalidade') === 'avulsa' ? 'extra' : 'numbers';
  const valor = params.get('valor') ?? undefined;
  const numbers = mode === 'numbers' ? parseNumbers(params.get('numeros')) : [];
  let amount = resolveAmount(valor);
  if (numbers.length && numberAllowance(numbers.length * NUMBER_UNIT_CENTS) === numbers.length) {
    // Pré-seleção de um pedido anterior ("Gerar novo Pix"): o pacote é o que cabe exatamente nesses números.
    amount = numbers.length * NUMBER_UNIT_CENTS;
  } else if (mode === 'extra') {
    // Colaboração avulsa aceita valor livre, com centavos.
    const cents = parseBRLToCents(valor ?? '');
    if (cents !== null && cents >= MIN_ORDER_CENTS && cents <= MAX_ORDER_CENTS) amount = cents;
  }
  return (
    <Checkout
      key={`${amount}-${mode}-${numbers.join('.')}`}
      initialAmount={amount}
      initialMode={mode}
      initialNumbers={numbers}
    />
  );
}
