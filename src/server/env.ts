import 'server-only';
import { z } from 'zod';

/**
 * Variáveis de ambiente validadas. Único ponto do servidor que lê `process.env`.
 * Tabela de referência: wiki/operacao/variaveis-de-ambiente.md.
 *
 * Regra de segurança: nenhuma mensagem de erro ou aviso deste arquivo contém o
 * valor de uma variável, só o nome e o motivo.
 */

const HEX_32_BYTES = /^[0-9a-f]{64}$/;

// Valores fixos usados SOMENTE em development/test quando a variável não existe.
// Em produção a ausência é erro de boot.
const DEV_AUTH_SECRET = '0123456789abcdef'.repeat(4);
const DEV_CPF_ENCRYPTION_KEY = 'fedcba9876543210'.repeat(4);

const hexSecret = z
  .string()
  .regex(HEX_32_BYTES, 'deve ter 64 caracteres hexadecimais minúsculos (32 bytes)')
  .optional();

const optionalString = z.string().optional();
const optionalUrl = z.string().url('deve ser uma URL válida').optional();
const optionalCents = z.coerce
  .number('deve ser um número inteiro de centavos')
  .int('deve ser um número inteiro de centavos')
  .nonnegative('não pode ser negativo')
  .optional();

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'], 'deve ser development, test ou production')
    .default('development'),
  NEXT_PUBLIC_SITE_URL: z
    .string('é obrigatória')
    .url('deve ser uma URL válida (ex.: https://dominio.com.br)'),
  DATABASE_URL: z.string('é obrigatória').min(1, 'não pode ser vazia'),
  AUTH_SECRET: hexSecret,
  CPF_ENCRYPTION_KEY: hexSecret,
  PAYMENT_GATEWAY: z.enum(
    ['mercadopago', 'fastpay', 'ironpay', 'demo'],
    'deve ser mercadopago, fastpay, ironpay ou demo',
  ),
  DEMO_MODE: z
    .enum(['true', 'false'], 'deve ser true ou false')
    .default('false')
    .transform((value) => value === 'true'),

  // Mercado Pago
  MP_ACCESS_TOKEN: optionalString,
  MP_PUBLIC_KEY: optionalString,
  MP_WEBHOOK_SECRET: optionalString,
  MP_ENVIRONMENT: z.enum(['sandbox', 'production'], 'deve ser sandbox ou production').optional(),
  MP_API_FLAVOR: z.enum(['orders', 'payments'], 'deve ser orders ou payments').default('orders'),

  // FastPay (stub pré-configurado)
  FASTPAY_API_URL: optionalUrl,
  FASTPAY_API_KEY: optionalString,
  FASTPAY_WEBHOOK_SECRET: optionalString,

  // IronPay (stub pré-configurado)
  IRONPAY_API_URL: optionalUrl,
  IRONPAY_API_KEY: optionalString,
  IRONPAY_WEBHOOK_SECRET: optionalString,

  // E-mail (SMTP)
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce
    .number('deve ser um número de porta')
    .int('deve ser um número de porta')
    .min(1, 'deve ser um número de porta')
    .max(65535, 'deve ser um número de porta')
    .optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'], 'deve ser true ou false')
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  MAIL_FROM: optionalString,
  MAIL_REPLY_TO: optionalString,

  // Operação
  CRON_SECRET: optionalString,
  LOG_LEVEL: z
    .enum(
      ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      'deve ser fatal, error, warn, info, debug, trace ou silent',
    )
    .default('info'),

  // Só para o seed inicial; depois vive no banco
  CAMPAIGN_GOAL_CENTS: optionalCents,
  CAMPAIGN_COSTS_CENTS: optionalCents,
  INSTAGRAM_FATHER_URL: optionalUrl,
  INSTAGRAM_MOTHER_URL: optionalUrl,

  // Só para o script admin:create
  ADMIN_BOOTSTRAP_EMAIL: z.string().email('deve ser um e-mail válido').optional(),
  ADMIN_BOOTSTRAP_NAME: optionalString,
  ADMIN_BOOTSTRAP_PASSWORD: optionalString,
});

const envSchema = baseSchema
  .superRefine((data, ctx) => {
    // `next build` roda com NODE_ENV=production e avalia este módulo ao coletar as rotas, ainda sem
    // os segredos de produção. As exigências abaixo valem quando o servidor sobe, não no build (ADR 010).
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    const isProduction = data.NODE_ENV === 'production' && !isBuild;

    if (isProduction && data.DEMO_MODE === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEMO_MODE'],
        message: 'DEMO_MODE não pode ser true em produção',
      });
    }

    if (isProduction && data.PAYMENT_GATEWAY === 'demo') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_GATEWAY'],
        message: 'PAYMENT_GATEWAY não pode ser demo em produção',
      });
    }

    if (isProduction) {
      for (const key of ['AUTH_SECRET', 'CPF_ENCRYPTION_KEY'] as const) {
        if (data[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'é obrigatória em produção (gere com: openssl rand -hex 32)',
          });
        }
      }
    }

    // As credenciais do gateway não são exigidas aqui: podem vir do painel (ADR 015). Sem elas em
    // nenhum dos dois lugares, criar pedido responde 503 (GATEWAY_NOT_CONFIGURED).

    if (isProduction && data.SMTP_HOST === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'é obrigatória em produção',
      });
    }
  })
  .transform((data) => ({
    ...data,
    AUTH_SECRET: data.AUTH_SECRET ?? DEV_AUTH_SECRET,
    CPF_ENCRYPTION_KEY: data.CPF_ENCRYPTION_KEY ?? DEV_CPF_ENCRYPTION_KEY,
  }));

export type Env = z.infer<typeof envSchema>;

// Cada aviso é impresso uma única vez por processo.
const printedWarnings = new Set<string>();

function warnOnce(message: string): void {
  if (printedWarnings.has(message)) return;
  printedWarnings.add(message);
  console.warn(`[env] ${message}`);
}

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  // Linha `CHAVE=` no .env chega como string vazia: tratar como ausente.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value;
  }

  const result = envSchema.safeParse(cleaned);

  if (!result.success) {
    // Só nome da variável + motivo. Nunca o valor recebido.
    const problems = result.error.issues.map((i) => i.path.join('.') + ': ' + i.message);
    throw new Error('Variáveis de ambiente inválidas:\n- ' + problems.join('\n- '));
  }

  const parsed = result.data;

  // Avisos. Os de AUTH_SECRET/CPF_ENCRYPTION_KEY só chegam aqui em development/test (em produção são erro).
  for (const key of ['AUTH_SECRET', 'CPF_ENCRYPTION_KEY'] as const) {
    if (cleaned[key] === undefined) {
      warnOnce(`${key} ausente: usando valor fixo de desenvolvimento. Nunca use em produção.`);
    }
  }

  if (parsed.PAYMENT_GATEWAY === 'mercadopago') {
    for (const key of ['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET'] as const) {
      if (parsed[key] === undefined) {
        warnOnce(
          `${key} ausente com PAYMENT_GATEWAY=mercadopago: sem a chave salva no painel, o gateway responderá "não configurado".`,
        );
      }
    }
  }

  return parsed;
}

export const env = parseEnv(process.env);

export const isDemo = env.DEMO_MODE && env.NODE_ENV !== 'production';
