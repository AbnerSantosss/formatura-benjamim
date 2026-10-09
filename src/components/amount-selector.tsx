'use client';
import { campaign, money } from '@/lib/campaign';
export default function AmountSelector({
  value,
  onChange,
  numbers = false,
}: {
  value: number;
  onChange: (amount: number) => void;
  numbers?: boolean;
}) {
  return (
    <div className="amounts" role="group" aria-label="Valor da colaboração">
      {campaign.amounts.map((amount) => (
        <button
          type="button"
          key={amount}
          aria-pressed={value === amount}
          onClick={() => onChange(amount)}
          className={`amount ${value === amount ? 'selected' : ''}`}
        >
          <span>{numbers ? `${amount / 50} números` : 'Contribuir com'}</span>
          <strong>{money(amount).replace(',00', '')}</strong>
          <span className="amount-check" aria-hidden="true">
            {value === amount ? '✓' : '+'}
          </span>
        </button>
      ))}
    </div>
  );
}
