import { handleWebhook } from '@/server/payment-sync';

export const dynamic = 'force-dynamic';

// Sem limite de requisições: quem protege esta rota é a assinatura do provedor.
export function POST(req: Request) {
  return handleWebhook('mercadopago', req);
}
