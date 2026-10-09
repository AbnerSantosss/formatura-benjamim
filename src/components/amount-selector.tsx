'use client';
import { campaign, money } from '@/lib/campaign';

export default function AmountSelector({ value, onChange }: { value: number; onChange: (amount: number) => void }) {
  return <div className="amounts" role="group" aria-label="Valor da contribuição">{campaign.amounts.map(amount => <button type="button" key={amount} aria-pressed={value === amount} onClick={() => onChange(amount)} className={`amount ${value === amount ? 'selected' : ''}`}><span>Contribuir com</span><strong>{money(amount).replace(',00', '')}</strong><span className="amount-check" aria-hidden="true">{value === amount ? '✓' : '+'}</span></button>)}</div>;
}
