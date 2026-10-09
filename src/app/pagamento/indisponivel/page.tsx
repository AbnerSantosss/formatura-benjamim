import type { Metadata } from 'next';
import Link from 'next/link';
import { Brand } from '@/components/shared';
import { prisma } from '@/server/db';
import '../payment-viewport.css';
import './unavailable.css';

// Aviso mostrado no lugar do QR Code quando não há meio de pagamento pronto (modo demonstração
// desligado e nenhum gateway configurado). Nenhum pedido é criado antes de chegar aqui.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pix indisponível · Benjamim',
  robots: { index: false, follow: false },
};

/** No lugar do QR Code: um QR "dormindo". */
function SleepingPix() {
  return (
    <svg
      className="pix-unavailable-art"
      viewBox="0 0 200 150"
      role="img"
      aria-label="Ilustração de um QR Code dormindo"
    >
      <rect
        x="45"
        y="20"
        width="110"
        height="110"
        rx="18"
        fill="#fff"
        stroke="#073c83"
        strokeWidth="5"
        strokeDasharray="10 8"
      />
      <rect x="58" y="33" width="24" height="24" rx="5" fill="#073c83" />
      <rect x="65" y="40" width="10" height="10" rx="2" fill="#fff" />
      <rect x="118" y="33" width="24" height="24" rx="5" fill="#073c83" />
      <rect x="125" y="40" width="10" height="10" rx="2" fill="#fff" />
      <rect x="58" y="93" width="24" height="24" rx="5" fill="#073c83" />
      <rect x="65" y="100" width="10" height="10" rx="2" fill="#fff" />
      <g fill="none" stroke="#073c83" strokeWidth="4" strokeLinecap="round">
        <path d="M82 76q7 7 14 0" />
        <path d="M106 76q7 7 14 0" />
        <path d="M100 96q8 7 16 0" />
      </g>
      <g fill="#0b55ad" fontFamily="inherit" fontWeight="900">
        <text x="160" y="52" fontSize="16">
          z
        </text>
        <text x="171" y="36" fontSize="21">
          z
        </text>
        <text x="184" y="18" fontSize="26">
          z
        </text>
      </g>
      <circle cx="30" cy="112" r="17" fill="#ffc928" />
      <path d="M30 102v11" stroke="#062e66" strokeWidth="5" strokeLinecap="round" />
      <circle cx="30" cy="121" r="3" fill="#062e66" />
    </svg>
  );
}

export default async function PagamentoIndisponivel() {
  const links = await prisma.campaign.findUnique({
    where: { id: 'main' },
    select: { instagramFather: true, instagramMother: true },
  });
  return (
    <div className="payment-viewport">
      <header className="payment-top">
        <Brand />
        <Link href="/">← Voltar à campanha</Link>
      </header>
      <main id="conteudo" className="payment-stage">
        <section className="demo-payment-card pix-unavailable" aria-labelledby="payment-title">
          <div className="pix-card-brand">
            <span aria-hidden="true">❖</span>
            <b>Pix</b>
            <small>Formatura do Benjamim</small>
          </div>
          <SleepingPix />
          <h1 id="payment-title">O Pix ainda não está funcionando</h1>
          <p>
            Não foi nada que você fez: o pagamento desta campanha ainda não foi ativado.{' '}
            <b>Por favor, avise os pais do Benjamim</b> para que eles possam resolver.
          </p>
          <p className="pix-unavailable-note">Nenhum valor foi cobrado e nenhum número ficou reservado.</p>
          {links?.instagramFather && (
            <a className="button wide" href={links.instagramFather} target="_blank" rel="noopener noreferrer">
              Avisar o pai no Instagram
            </a>
          )}
          {links?.instagramMother && (
            <a
              className="secondary-button wide"
              href={links.instagramMother}
              target="_blank"
              rel="noopener noreferrer"
            >
              Avisar a mãe no Instagram
            </a>
          )}
          <div className="payment-links">
            <Link href="/contribuir">Tentar de novo</Link>
            <Link href="/">Voltar à campanha</Link>
          </div>
        </section>
      </main>
      <footer className="payment-bottom">
        <span />
        <nav aria-label="Informações do pagamento">
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/termos">Termos</Link>
        </nav>
      </footer>
    </div>
  );
}
