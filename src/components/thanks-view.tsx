import Link from 'next/link';
import { CheckCircle2, Heart } from 'lucide-react';
import { formatBRL } from '@/domain/money';
import { formatNumber } from '@/domain/orders';

// Visual da página de obrigado. Design intocável: JSX e classes são os do protótipo;
// só a origem dos dados mudou (a prop `order` vem do servidor, já conferido como APPROVED).

export type ThanksOrder = {
  id: string;
  status: 'APPROVED';
  amountCents: number;
  numbers: number[];
  product: { title: string; mode: 'NUMBERS' | 'EXTRA' };
  contributorFirstName: string;
};

const modeLabel = {
  NUMBERS: 'Números das cestas',
  EXTRA: 'Colaboração avulsa',
} as const;

export function ThanksView({ order }: { order: ThanksOrder }) {
  const hasNumbers = order.numbers.length > 0;
  return (
    <div className="thanks-content">
      <div className="handwritten thanks-signature">
        Nosso muito obrigado! <Heart aria-hidden="true" />
      </div>
      <section className="demo-payment-card thanks-card" aria-labelledby="thanks-title">
        <span className="demo-chip">
          <CheckCircle2 size={14} /> PIX APROVADO NA DEMONSTRAÇÃO
        </span>
        <span className="thanks-family-label">COM CARINHO, NOSSA FAMÍLIA</span>
        <h1 id="thanks-title">
          Você faz parte
          <br />
          dessa conquista!
        </h1>
        <p>
          Seu carinho torna a formatura do ABC do Benjamim ainda mais especial. Nossa família agradece por
          celebrar essa conquista com a gente.
        </p>
        <div className="thanks-receipt">
          <span>Pedido na demonstração</span>
          <strong>{formatBRL(order.amountCents)}</strong>
          <span>
            <CheckCircle2 size={14} /> Aprovação simulada
          </span>
        </div>
        <div className="order-product-detail">
          <b>{order.product.title}</b>
          <span>
            {modeLabel[order.product.mode]}
            {order.product.mode === 'NUMBERS' ? ` · ${order.numbers.length} números` : ' · sem números'}
          </span>
          {hasNumbers && (
            <details>
              <summary>Ver números do pedido</summary>
              <p>{order.numbers.map(formatNumber).join(' · ')}</p>
            </details>
          )}
        </div>
        <p className="thanks-note">Este é um teste. Nenhum dinheiro foi movimentado.</p>
        <Link className="button wide" href="/">
          Voltar à campanha
        </Link>
        <div className="payment-links">
          <Link href="/admin">Ver no backoffice</Link>
          <Link href="/contribuir">Fazer outra simulação</Link>
        </div>
      </section>
    </div>
  );
}
