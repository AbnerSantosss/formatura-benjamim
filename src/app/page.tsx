import ReferenceLanding from '@/components/reference-landing';
import { prisma } from '@/server/db';
import { getCampaignSummary } from '@/server/orders.service';
import './reference.css';

export const revalidate = 30;

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
