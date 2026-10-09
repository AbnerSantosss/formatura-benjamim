'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Heart } from 'lucide-react';
import { useDemo, useDemoClock } from '@/lib/demo-store';
import { effectiveStatus } from '@/lib/demo-model';
import { money } from '@/lib/campaign';
import OrderDetails from './order-details';

export default function DemoThanks() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, ready } = useDemo();
  const now = useDemoClock();
  const payment = data.payments.find((item) => item.id === params.get('id'));
  const approved = payment && effectiveStatus(payment, now) === 'approved';
  useEffect(() => {
    if (ready && payment && !approved) router.replace(`/pagamento?id=${payment.id}`);
  }, [ready, payment, approved, router]);
  if (!ready || (payment && !approved))
    return <div className="demo-payment-card">Conferindo sua contribuição…</div>;
  if (!payment)
    return (
      <div className="demo-payment-card">
        <h1>Contribuição não encontrada</h1>
        <p>Inicie uma simulação para conhecer o agradecimento.</p>
        <Link className="button wide" href="/contribuir">
          Iniciar simulação
        </Link>
      </div>
    );
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
          <strong>{money(payment.amount)}</strong>
          <span>
            <CheckCircle2 size={14} /> Aprovação simulada
          </span>
        </div>
        <OrderDetails payment={payment} />
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
