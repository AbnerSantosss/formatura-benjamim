import { GraduationCap, Heart } from 'lucide-react';
import { Header, Footer, Portrait, Progress } from '@/components/shared';
import { Suspense } from 'react';
import CheckoutEntry from '@/components/checkout-entry';
import { prisma } from '@/server/db';
import { getCampaignSummary } from '@/server/orders.service';

// Total arrecadado e links do rodapé vêm do banco.
// Renderizada a cada visita: o `next build` (dentro do `docker build`) roda sem banco, então a página
// não pode ser pré-renderizada lendo a campanha. Ver wiki/operacao/deploy.md.
export const dynamic = 'force-dynamic';

export default async function Contribuir() {
  const [summary, links] = await Promise.all([
    getCampaignSummary(new Date()),
    prisma.campaign.findUnique({
      where: { id: 'main' },
      select: { instagramFather: true, instagramMother: true },
    }),
  ]);
  return (
    <>
      <Header checkout />
      <main id="conteudo" className="checkout-main">
        <div className="container checkout-steps" aria-label="Etapas do pedido">
          <span className="active">
            <b>1</b> Escolha
          </span>
          <i />
          <span>
            <b>2</b> Pagamento
          </span>
          <i />
          <span>
            <b>3</b> Agradecimento
          </span>
        </div>
        <div className="container checkout-layout">
          <aside className="checkout-aside">
            <span className="badge">
              <GraduationCap size={18} /> FORMATURA DO ABC
            </span>
            <h2>
              Um pequeno gesto.
              <br />
              <span>Um grande sorriso.</span>
            </h2>
            <p>Você está ajudando a transformar a formatura do Benjamim em uma memória para a vida toda.</p>
            <Portrait compact />
            <Progress compact raisedCents={summary.raisedCents} goalCents={summary.goalCents} />
            <div className="aside-note">
              <Heart size={22} />
              <p>
                Uma iniciativa da nossa família.
                <br />
                <b>Todo carinho faz a diferença.</b>
              </p>
            </div>
          </aside>
          <Suspense fallback={<div className="checkout-card">Carregando sua contribuição…</div>}>
            <CheckoutEntry />
          </Suspense>
        </div>
      </main>
      <Footer instagramFather={links?.instagramFather} instagramMother={links?.instagramMother} />
    </>
  );
}
