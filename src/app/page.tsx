import ReferenceLanding from '@/components/reference-landing';
import { prisma } from '@/server/db';
import { getCampaignSummary } from '@/server/orders.service';
import './reference.css';

// Renderizada a cada visita: o `next build` (dentro do `docker build`) roda sem banco, então a página
// não pode ser pré-renderizada lendo a campanha. Ver wiki/operacao/deploy.md.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [summary, instagram] = await Promise.all([
    getCampaignSummary(new Date()),
    prisma.campaign.findUnique({
      where: { id: 'main' },
      select: { instagramFather: true, instagramMother: true },
    }),
  ]);
  return (
    <ReferenceLanding
      summary={{
        raisedCents: summary.raisedCents,
        goalCents: summary.goalCents,
        numbersSold: summary.numbersSold,
        numbersAvailable: summary.numbersAvailable,
        drawAt: summary.drawAt ? summary.drawAt.toISOString() : null,
        drawPublic: summary.drawPublic,
        winner: summary.winner,
      }}
      instagramFather={instagram?.instagramFather ?? ''}
      instagramMother={instagram?.instagramMother ?? ''}
    />
  );
}
