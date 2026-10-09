'use client';
import { useSearchParams } from 'next/navigation';
import Checkout from './checkout';
import { resolveAmount } from '@/lib/campaign';
export default function CheckoutEntry() {
  const params = useSearchParams();
  const amount = resolveAmount(params.get('valor') ?? undefined);
  return <Checkout key={amount} initialAmount={amount} />;
}
