'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CheckCircle2, Clock3, Copy, QrCode, RotateCcw, TimerOff } from 'lucide-react';
import { changeDemoStatus, createDemoPayment, useDemo, useDemoClock } from '@/lib/demo-store';
import { effectiveStatus } from '@/lib/demo-model';
import { money } from '@/lib/campaign';
import OrderDetails from './order-details';

export default function DemoPayment() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, ready } = useDemo();
  const now = useDemoClock();
  const [notice, setNotice] = useState('');
  const payment = data.payments.find((item) => item.id === params.get('id'));
  const status = payment ? effectiveStatus(payment, now) : null;
  useEffect(() => {
    if (ready && payment && status === 'approved') router.replace(`/obrigado?id=${payment.id}`);
  }, [ready, payment, status, router]);
  if (!ready) return <div className="demo-payment-card">Carregando simulação.</div>;
  if (!payment)
    return (
      <div className="demo-payment-card">
        <QrCode size={32} />
        <h1>Simulação não encontrada</h1>
        <p>Os testes ficam apenas neste navegador. Comece uma nova contribuição para experimentar o fluxo.</p>
        <Link href="/contribuir" className="button wide">
          Iniciar uma simulação
        </Link>
      </div>
    );
  const remaining = Math.max(0, Math.ceil((payment.expiresAt - Math.max(now, payment.createdAt)) / 1000));
  const code = `SIMULACAO-SEM-VALOR-FINANCEIRO:${payment.id}`;
  const change = (next: 'approved' | 'expired') => {
    try {
      changeDemoStatus(payment.id, next);
      setNotice('');
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setNotice('Código de teste copiado. Não funciona em aplicativos bancários.');
    } catch {
      setNotice('Não foi possível copiar. Selecione o código no campo.');
    }
  }
  function renewPix() {
    try {
      const id = createDemoPayment(payment!.amount, payment!.mode || 'extra', payment!.numbers || []);
      setNotice('');
      router.replace(`/pagamento?id=${id}`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  return (
    <section className={`demo-payment-card payment-${status}`} aria-labelledby="payment-title">
      <div className="pix-card-brand">
        <span aria-hidden="true">❖</span>
        <b>Pix</b>
        <small>Formatura do Benjamim</small>
      </div>
      <span className="demo-chip">SIMULAÇÃO · SEM VALOR FINANCEIRO</span>
      <h1 id="payment-title">
        {status === 'approved'
          ? 'Pix aprovado!'
          : status === 'pending'
            ? 'Seu pedido via Pix'
            : status === 'expired'
              ? 'Seu Pix de teste expirou'
              : 'Pix de teste estornado'}
      </h1>
      <p>
        {status === 'approved'
          ? 'Abrindo seu agradecimento…'
          : status === 'pending'
            ? 'Um gesto de carinho para a formatura do Benjamim. Experimente o pagamento abaixo.'
            : status === 'expired'
              ? 'Nenhuma cobrança foi feita. Você pode começar outro teste quando quiser.'
              : 'O valor foi retirado das métricas de aprovação da demonstração.'}
      </p>
      <div className="payment-summary">
        <div>
          <span className="payment-summary-label">Total do pedido</span>
          <strong className="payment-amount">{money(payment.amount)}</strong>
          {status === 'pending' && (
            <div className="demo-timer">
              <Clock3 size={14} /> Expira em {String(Math.floor(remaining / 60)).padStart(2, '0')}:
              {String(remaining % 60).padStart(2, '0')}
            </div>
          )}
        </div>
        {status === 'pending' ? (
          <div className="demo-qr">
            <QrCode size={44} aria-hidden="true" />
            <b>DEMONSTRAÇÃO</b>
            <span>Sem QR Code pagável</span>
          </div>
        ) : (
          <span className="payment-summary-status">
            {status === 'approved' ? <CheckCircle2 /> : status === 'expired' ? <TimerOff /> : <RotateCcw />}
          </span>
        )}
      </div>
      <OrderDetails payment={payment} />
      {status === 'pending' && (
        <>
          <label className="demo-code-label">
            Código ilustrativo — não é um Pix
            <input readOnly value={code} onFocus={(event) => event.target.select()} />
          </label>
          <button type="button" className="secondary-button wide" onClick={copyCode}>
            <Copy size={16} /> Copiar código de demonstração
          </button>
          <button className="button wide" onClick={() => change('approved')}>
            <Check size={17} /> Simular pagamento aprovado
          </button>
          <button className="text-button" onClick={() => change('expired')}>
            Simular expiração
          </button>
        </>
      )}
      {notice && (
        <p className="demo-feedback" role="status">
          {notice}
        </p>
      )}
      {status === 'approved' && (
        <Link href={`/obrigado?id=${payment.id}`} className="button wide">
          Ver agradecimento
        </Link>
      )}
      {(status === 'expired' || status === 'refunded') && (
        <button className="button wide" onClick={renewPix}>
          Gerar novo Pix de teste
        </button>
      )}
      <div className="payment-links">
        <Link href="/admin">Ver no backoffice</Link>
        <Link href="/">Voltar à campanha</Link>
      </div>
      <small>Registro {payment.id.slice(0, 13)} · salvo neste navegador</small>
    </section>
  );
}
