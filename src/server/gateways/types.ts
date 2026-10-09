// Contrato único dos gateways de pagamento (ADR 003).
// Só tipos: este arquivo não lê ambiente nem faz chamada de rede.
import type { OrderMode } from '@/domain/types';

export type GatewayId = 'mercadopago' | 'fastpay' | 'ironpay' | 'demo';

export const GATEWAY_IDS: readonly GatewayId[] = ['mercadopago', 'fastpay', 'ironpay', 'demo'];

export interface CreateChargeInput {
  order: {
    /** Elo entre gateway e banco: vai como `external_reference` e como chave de idempotência. */
    id: string;
    /** Total do pedido em centavos inteiros. */
    amountCents: number;
    /** Fim da reserva local (UTC). */
    expiresAt: Date;
  };
  product: {
    title: string;
    mode: OrderMode;
    /** Preço unitário em centavos (`Product.unitCents`, ADR 009). Zero em produto EXTRA. */
    unitCents: number;
  };
  /** Quantidade de números. Em colaboração avulsa (EXTRA) o item vai sempre com quantidade 1. */
  quantity: number;
  payer: {
    name: string;
    email: string;
    /** 11 dígitos, sem máscara. */
    cpf: string;
  };
}

export interface PixCharge {
  providerOrderId?: string;
  providerPaymentId?: string;
  /** Pix copia e cola. */
  qrCode: string;
  /** Imagem do QR em base64, sem o prefixo `data:`. */
  qrCodeBase64: string;
  ticketUrl?: string;
  /** Vencimento da cobrança NO PROVEDOR. Pode ser posterior ao fim da reserva local. */
  expiresAt: Date;
  raw: unknown;
}

export interface ProviderRef {
  providerOrderId?: string;
  providerPaymentId?: string;
}

export type ProviderStatusValue = 'approved' | 'pending' | 'rejected' | 'refunded';

export interface ProviderStatus {
  status: ProviderStatusValue;
  amountCents: number;
  providerPaymentId: string;
  /** `order.id` devolvido pelo provedor. A rota usa este valor, nunca o corpo do webhook. */
  externalReference?: string;
  raw: unknown;
}

export interface WebhookRequest {
  headers: Headers;
  url: string;
  rawBody: string;
}

export type WebhookVerdict = { ok: true; eventId: string; ref: ProviderRef } | { ok: false; reason: string };

export interface RefundResult {
  ok: boolean;
  providerRefundId?: string;
  raw: unknown;
}

export interface PaymentGateway {
  readonly id: GatewayId;
  isConfigured(): boolean;
  createPixCharge(input: CreateChargeInput): Promise<PixCharge>;
  fetchStatus(ref: ProviderRef): Promise<ProviderStatus>;
  /** Valida a assinatura e extrai o id do recurso. Nunca devolve status. */
  verifyWebhook(req: WebhookRequest): Promise<WebhookVerdict>;
  /** Sem `amountCents` = estorno total. */
  refund(ref: ProviderRef, amountCents?: number): Promise<RefundResult>;
}
