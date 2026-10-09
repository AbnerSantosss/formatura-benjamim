import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PaymentFrame from '@/components/payment-frame';
import { DEMO_QR_CODE_BASE64 } from '@/server/gateways/demo';
import { demoAllowed } from '@/server/gateways/registry';
import { getOrderPublic } from '@/server/orders.service';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params;
  const { t } = await searchParams;
  const token = typeof t === 'string' ? t : '';
  const now = new Date();
  // Sem o token certo a resposta é a mesma de pedido inexistente.
  const order = await getOrderPublic(id, token, { now });
  if (!order) notFound();
  if (order.status === 'APPROVED') {
    redirect(`/obrigado/${encodeURIComponent(order.id)}?t=${encodeURIComponent(token)}`);
  }
  // A apresentação de demonstração (QR ilustrativo e botões de simulação) só vale para cobrança
  // criada no gateway demo com a demonstração liberada. O servidor recusa a simulação fora disso.
  const demo = order.payment?.qrCodeBase64 === DEMO_QR_CODE_BASE64 && (await demoAllowed());
  return <PaymentFrame order={order} token={token} now={now.getTime()} demo={demo} />;
}
