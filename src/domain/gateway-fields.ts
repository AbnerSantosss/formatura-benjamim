// Campos de configuração de cada gateway no painel. Só descrição: nenhum valor passa por aqui.
// Usado pelo servidor (validação e leitura) e pela tela (rótulos).

export type ConfigurableGatewayId = 'mercadopago' | 'fastpay' | 'ironpay';

export const CONFIGURABLE_GATEWAY_IDS: readonly ConfigurableGatewayId[] = [
  'mercadopago',
  'fastpay',
  'ironpay',
];

export type GatewayFieldDef = {
  name: string;
  label: string;
  /** Segredo: o painel nunca recebe o valor de volta, só se está preenchido. */
  secret: boolean;
  /** Entra na conta de "configurado". */
  required: boolean;
  /** Valor precisa ser um endereço https. */
  url?: boolean;
  hint?: string;
};

export type GatewayDef = {
  id: ConfigurableGatewayId;
  label: string;
  /** Falso = adapter esqueleto: aceita guardar as chaves, mas ainda não cobra nem pode ser ativado. */
  implemented: boolean;
  fields: readonly GatewayFieldDef[];
};

const stubFields: readonly GatewayFieldDef[] = [
  { name: 'apiUrl', label: 'Endereço da API', secret: false, required: true, url: true, hint: 'https://…' },
  { name: 'apiKey', label: 'Chave da API', secret: true, required: true },
  { name: 'webhookSecret', label: 'Segredo do webhook', secret: true, required: true },
];

export const GATEWAY_DEFS: Record<ConfigurableGatewayId, GatewayDef> = {
  mercadopago: {
    id: 'mercadopago',
    label: 'Mercado Pago',
    implemented: true,
    fields: [
      {
        name: 'accessToken',
        label: 'Access Token de produção',
        secret: true,
        required: true,
        hint: 'Começa com APP_USR-',
      },
      {
        name: 'webhookSecret',
        label: 'Assinatura secreta do webhook',
        secret: true,
        required: true,
        hint: 'Suas integrações > Webhooks',
      },
      { name: 'publicKey', label: 'Public Key (opcional)', secret: false, required: false },
    ],
  },
  fastpay: { id: 'fastpay', label: 'FastPay', implemented: false, fields: stubFields },
  ironpay: { id: 'ironpay', label: 'IronPay', implemented: false, fields: stubFields },
};
