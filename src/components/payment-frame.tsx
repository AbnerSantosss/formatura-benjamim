import Link from 'next/link';
import { Brand } from './shared';
import '@/app/pagamento/payment-viewport.css';

export default function PaymentFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="payment-viewport">
      <header className="payment-top">
        <Brand />
        <Link href="/">← Voltar à campanha</Link>
      </header>
      <main id="conteudo" className="payment-stage">
        {children}
      </main>
      <footer className="payment-bottom">
        <span>Demonstração · sem cobrança real</span>
        <nav aria-label="Informações do pagamento">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </footer>
    </div>
  );
}
