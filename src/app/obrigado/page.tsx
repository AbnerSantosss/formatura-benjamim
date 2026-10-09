import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Brand } from '@/components/shared';
import DemoThanks from '@/components/demo-thanks';
import './thanks.css';

export default function Obrigado() {
  return (
    <div className="thanks-viewport">
      <div className="thanks-family-background">
        <Image
          src="/images/familia-benjamim-cartoon.png"
          alt="Ilustração de Benjamim ao lado da mãe e do pai"
          fill
          sizes="(max-width: 800px) 100vw, 58vw"
          loading="eager"
        />
      </div>
      <header className="thanks-header">
        <Brand />
        <span>FORMATURA DO ABC</span>
      </header>
      <main id="conteudo" className="thanks-stage">
        <Suspense fallback={<p>Conferindo sua contribuição.</p>}>
          <DemoThanks />
        </Suspense>
      </main>
      <footer className="thanks-footer">
        <span>Feito com carinho pela família do Benjamim</span>
        <Link href="/">Voltar ao início</Link>
      </footer>
    </div>
  );
}
