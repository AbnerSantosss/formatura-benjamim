import 'server-only';
import { GatewayNotImplementedError } from '@/server/errors';
import type {
  CreateChargeInput,
  PaymentGateway,
  PixCharge,
  ProviderRef,
  ProviderStatus,
  RefundResult,
  WebhookRequest,
  WebhookVerdict,
} from './types';

// FastPay: adapter esqueleto (wiki/integracoes/fastpay.md).
// Nenhum endpoint ou campo do provedor está escrito aqui de propósito: só entram depois de conferidos
// na documentação oficial do FastPay. Até lá o adapter é fail-closed: não cria cobrança, não consulta,
// não estorna e não aceita webhook.

export type FastPayConfig = {
  apiUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
};

export function createFastPayGateway(config: FastPayConfig): PaymentGateway {
  return {
    id: 'fastpay',

    isConfigured: () => Boolean(config.apiUrl && config.apiKey && config.webhookSecret),

    async createPixCharge(input: CreateChargeInput): Promise<PixCharge> {
      // TODO(fastpay): POST <endpoint de cobrança Pix> em `config.apiUrl`, autenticado com `config.apiKey`.
      // Mapear: valor = input.order.amountCents; external_reference (ou equivalente) = input.order.id;
      // expiração de 10 min; pagador = input.payer (nome, e-mail, CPF); item conforme ADR 002.
      // Devolver PixCharge com qrCode, qrCodeBase64, ids do provedor e expiresAt.
      void input;
      throw new GatewayNotImplementedError();
    },

    async fetchStatus(ref: ProviderRef): Promise<ProviderStatus> {
      // TODO(fastpay): GET <endpoint de consulta> e mapear o status do provedor para
      // approved | pending | rejected | refunded, preenchendo amountCents e externalReference (= order.id).
      void ref;
      throw new GatewayNotImplementedError();
    },

    async verifyWebhook(req: WebhookRequest): Promise<WebhookVerdict> {
      // TODO(fastpay): validar assinatura conforme doc usando `config.webhookSecret` (comparação em tempo
      // constante) e extrair providerPaymentId. Enquanto isso a rota responde 503 e NÃO processa.
      void req;
      return { ok: false, reason: 'not-implemented' };
    },

    async refund(ref: ProviderRef, amountCents?: number): Promise<RefundResult> {
      // TODO(fastpay): POST <endpoint de estorno> (total quando amountCents é undefined), com idempotência.
      void ref;
      void amountCents;
      throw new GatewayNotImplementedError();
    },
  };
}
