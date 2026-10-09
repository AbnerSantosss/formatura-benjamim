import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Brand } from '@/components/shared';
import { ThanksView } from '@/components/thanks-view';
import { DEMO_QR_CODE_BASE64 } from '@/server/gateways/demo';
import { getOrderPublic } from '@/server/orders.service';
import '../thanks.css';

// Página de obrigado: só mostra o agradecimento para pedido que o SERVIDOR confirmou como APPROVED.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Obrigado! · Benjamim',
    robots: { index: false },
  };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Obrigado({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = typeof t === 'string' ? t : '';

  const order = await getOrderPublic(id, token, { now: new Date() });
  if (!order) notFound();
  if (order.status !== 'APPROVED') redirect(`/pagamento/${id}?t=${encodeURIComponent(token)}`);

  return (
    <div className="thanks-viewport">
      <div className="thanks-family-background">
        <Image
          src="/images/familia-benjamim-cartoon.webp"
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
        <ThanksView
          demo={order.payment?.qrCodeBase64 === DEMO_QR_CODE_BASE64}
          order={{
            id: order.id,
            status: order.status,
            amountCents: order.amountCents,
            numbers: order.numbers,
            product: { title: order.product.title, mode: order.product.mode },
            contributorFirstName: order.firstName,
          }}
        />
      </main>
      <footer className="thanks-footer">
        <span>Feito com carinho pela família do Benjamim</span>
        <Link href="/">Voltar ao início</Link>
      </footer>
    </div>
  );
}
