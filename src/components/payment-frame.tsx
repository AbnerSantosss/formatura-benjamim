'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Clock3, Copy, QrCode, RotateCcw, TimerOff } from 'lucide-react';
import { formatBRL } from '@/domain/money';
import type { OrderStatus } from '@/domain/types';
import { approveDemoOrder } from '@/lib/api-client';
import type { PublicOrder } from '@/server/orders.service';
import OrderDetails from './order-details';
import PaymentStatusPoller from './payment-status-poller';
import { Brand } from './shared';
import '@/app/pagamento/payment-viewport.css';

// Tela de pagamento. Design intocável: JSX, classes e ordem são os do protótipo (`demo-payment.tsx`);
// só a origem dos dados mudou. O pedido chega do servidor por prop e o status só é CONSULTADO no
// servidor (`PaymentStatusPoller`); nada aqui confirma pagamento.

type View = 'pending' | 'approved' | 'expired' | 'refunded';

// Textos do protótipo (demonstração) e a versão sem as menções a teste para cobrança real.
const demoCopy = {
  expiredTitle: 'Seu Pix de teste expirou',
  refundedTitle: 'Pix de teste estornado',
  pendingText: 'Um gesto de carinho para a formatura do Benjamim. Experimente o pagamento abaixo.',
  expiredText: 'Nenhuma cobrança foi feita. Você pode começar outro teste quando quiser.',
  refundedText: 'O valor foi retirado das métricas de aprovação da demonstração.',
  codeLabel: 'Código ilustrativo — não é um Pix',
  copyButton: 'Copiar código de demonstração',
  copied: 'Código de teste copiado. Não funciona em aplicativos bancários.',
  renew: 'Gerar novo Pix de teste',
  recordSuffix: ' · salvo neste navegador',
  footer: 'Demonstração · sem cobrança real',
};
const realCopy: typeof demoCopy = {
  expiredTitle: 'Seu Pix expirou',
  refundedTitle: 'Pix estornado',
  pendingText: 'Um gesto de carinho para a formatura do Benjamim.',
  expiredText: 'Nenhuma cobrança foi feita. Você pode gerar um novo Pix quando quiser.',
  refundedText: 'O valor deste pedido foi estornado.',
  codeLabel: 'Pix copia e cola',
  copyButton: 'Copiar código Pix',
  copied: 'Código Pix copiado.',
  renew: 'Gerar novo Pix',
  recordSuffix: '',
  footer: '',
};

type Props = {
  order: PublicOrder;
  /** Token público do pedido (`?t=`), usado só para consultar o status e seguir para o obrigado. */
  token: string;
  /** Relógio do servidor (ms) no momento em que a página foi montada. */
  now: number;
  /** Vem do servidor: modo demonstração ligado e cobrança do gateway demo. */
  demo: boolean;
};

export default function PaymentFrame({ order, token, now, demo }: Props) {
  const router = useRouter();
  const codeInput = useRef<HTMLInputElement>(null);
  const [serverStatus, setServerStatus] = useState<OrderStatus>(order.status);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [approving, setApproving] = useState(false);
  const [expirySimulated, setExpirySimulated] = useState(false);

  // O cronômetro parte do relógio do servidor (`now`) e do `expiresAt` do pedido; o relógio do
  // navegador só mede quanto tempo passou desde a montagem.
  useEffect(() => {
    const mountedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - mountedAt), 1000);
    return () => clearInterval(timer);
  }, []);

  const copy = demo ? demoCopy : realCopy;
  const expiresAt = new Date(order.expiresAt).getTime();
  const remaining = Math.max(0, Math.ceil((expiresAt - (now + elapsed)) / 1000));
  const status: View =
    serverStatus === 'APPROVED'
      ? 'approved'
      : serverStatus === 'REFUNDED'
        ? 'refunded'
        : serverStatus !== 'PENDING' || expirySimulated || remaining === 0
          ? 'expired'
          : 'pending';
  const code = order.payment?.qrCode ?? '';
  const qrCodeBase64 = order.payment?.qrCodeBase64 ?? '';
  const thanksUrl = `/obrigado/${encodeURIComponent(order.id)}?t=${encodeURIComponent(token)}`;

  async function approveDemo() {
    if (approving) return;
    setApproving(true);
    try {
      // Só existe no modo demonstração (o servidor responde 404 fora dele). A tela não assume o
      // resultado: pede uma nova consulta de status ao servidor.
      await approveDemoOrder(order.id);
      setNotice('');
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setApproving(false);
    }
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(copy.copied);
    } catch {
      try {
        codeInput.current?.select();
        if (!document.execCommand('copy')) throw new Error('copy');
        setNotice(copy.copied);
      } catch {
        setNotice('Não foi possível copiar. Selecione o código no campo.');
      }
    }
  }
  function renewPix() {
    const query = new URLSearchParams({ valor: String(order.amountCents / 100) });
    if (order.mode === 'EXTRA') query.set('modalidade', 'avulsa');
    const numbers = order.numbers.length ? `&numeros=${order.numbers.join(',')}` : '';
    router.push(`/contribuir?${query.toString()}${numbers}`);
  }
  return (
    <div className="payment-viewport">
      <PaymentStatusPoller
        orderId={order.id}
        token={token}
        active={serverStatus === 'PENDING'}
        refreshKey={refreshKey}
        onStatus={setServerStatus}
      />
      <header className="payment-top">
        <Brand />
        <Link href="/">← Voltar à campanha</Link>
      </header>
      <main id="conteudo" className="payment-stage">
        <section className={`demo-payment-card payment-${status}`} aria-labelledby="payment-title">
          <div className="pix-card-brand">
            <span aria-hidden="true">❖</span>
            <b>Pix</b>
            <small>Formatura do Benjamim</small>
          </div>
          {demo && <span className="demo-chip">SIMULAÇÃO · SEM VALOR FINANCEIRO</span>}
          <h1 id="payment-title">
            {status === 'approved'
              ? 'Pix aprovado!'
              : status === 'pending'
                ? 'Seu pedido via Pix'
                : status === 'expired'
                  ? copy.expiredTitle
                  : copy.refundedTitle}
          </h1>
          <p>
            {status === 'approved'
              ? 'Abrindo seu agradecimento…'
              : status === 'pending'
                ? copy.pendingText
                : status === 'expired'
                  ? copy.expiredText
                  : copy.refundedText}
          </p>
          <div className="payment-summary">
            <div>
              <span className="payment-summary-label">Total do pedido</span>
              <strong className="payment-amount">{formatBRL(order.amountCents)}</strong>
              {status === 'pending' && (
                <div className="demo-timer">
                  <Clock3 size={14} /> Expira em {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                  {String(remaining % 60).padStart(2, '0')}
                </div>
              )}
            </div>
            {status === 'pending' ? (
              <div className="demo-qr">
                {demo || !qrCodeBase64 ? (
                  <>
                    <QrCode size={44} aria-hidden="true" />
                    {demo && (
                      <>
                        <b>DEMONSTRAÇÃO</b>
                        <span>Sem QR Code pagável</span>
                      </>
                    )}
                  </>
                ) : (
                  // Imagem em data URI vinda do gateway: `next/image` não se aplica. O tamanho inline só
                  // faz o QR caber na caixa que já existe (não há regra de CSS para `img` aqui).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="QR Code Pix"
                    src={`data:image/png;base64,${qrCodeBase64}`}
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                  />
                )}
              </div>
            ) : (
              <span className="payment-summary-status">
                {status === 'approved' ? (
                  <CheckCircle2 />
                ) : status === 'expired' ? (
                  <TimerOff />
                ) : (
                  <RotateCcw />
                )}
              </span>
            )}
          </div>
          <OrderDetails order={order} />
          {status === 'pending' && (
            <>
              <label className="demo-code-label">
                {copy.codeLabel}
                <input ref={codeInput} readOnly value={code} onFocus={(event) => event.target.select()} />
              </label>
              <button type="button" className="secondary-button wide" onClick={copyCode}>
                <Copy size={16} /> {copy.copyButton}
              </button>
              {demo && (
                <>
                  <button className="button wide" onClick={approveDemo} disabled={approving}>
                    <Check size={17} /> Simular aprovação (demo)
                  </button>
                  <button className="text-button" onClick={() => setExpirySimulated(true)}>
                    Simular expiração
                  </button>
                </>
              )}
            </>
          )}
          {notice && (
            <p className="demo-feedback" role="status">
              {notice}
            </p>
          )}
          {status === 'approved' && (
            <Link href={thanksUrl} className="button wide">
              Ver agradecimento
            </Link>
          )}
          {(status === 'expired' || status === 'refunded') && (
            <button className="button wide" onClick={renewPix}>
              {copy.renew}
            </button>
          )}
          <div className="payment-links">
            <Link href="/admin">Ver no backoffice</Link>
            <Link href="/">Voltar à campanha</Link>
          </div>
          <small>
            Registro {order.id.slice(0, 13)}
            {copy.recordSuffix}
          </small>
        </section>
      </main>
      <footer className="payment-bottom">
        <span>{copy.footer}</span>
        <nav aria-label="Informações do pagamento">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </footer>
    </div>
  );
}
