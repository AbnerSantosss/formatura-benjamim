import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `src/server/env.ts` valida `process.env` no import: o env mínimo precisa existir ANTES.
// SMTP_* é apagado de propósito: sem SMTP_HOST o transporte é `jsonTransport` e nenhum
// e-mail real sai da máquina, mesmo que o terminal de quem roda os testes tenha SMTP configurado.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3180';
  process.env.DATABASE_URL = 'postgresql://benjamim:benjamim@localhost:5443/benjamim_test';
  process.env.PAYMENT_GATEWAY = 'demo';
  process.env.MAIL_FROM = 'BENJAMIM ABC <notificacoes@exemplo.com>';
  process.env.MAIL_REPLY_TO = 'familia@exemplo.com';
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS']) {
    delete process.env[key];
  }
});

// A auditoria grava no banco; aqui só interessa saber como foi chamada.
vi.mock('@/server/audit', () => ({ audit: vi.fn(async () => undefined) }));

import { audit } from '@/server/audit';
import { sendEmail } from '@/server/email/send';
import { emailMode, getTransport } from '@/server/email/transport';

const DESTINATARIO = 'ana.teste@exemplo.com';
const convite = { nome: 'Ana', convidadoPor: 'Abner', url: 'https://exemplo.com/convite/abc' };

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(audit).mockClear();
});

describe('transporte', () => {
  it('sem SMTP_HOST usa o modo console (jsonTransport) e é singleton', () => {
    expect(emailMode()).toBe('console');
    expect(getTransport()).toBe(getTransport());
    expect(getTransport().transporter.name).toBe('JSONTransport');
  });
});

describe('sendEmail', () => {
  it('com jsonTransport devolve ok e o remetente é BENJAMIM ABC', async () => {
    const sendMail = vi.spyOn(getTransport(), 'sendMail');

    const result = await sendEmail('convite-admin', DESTINATARIO, convite);

    expect(result).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(1);

    const options = sendMail.mock.calls[0][0];
    expect(String(options.from)).toContain('BENJAMIM ABC');
    expect(options.to).toBe(DESTINATARIO);
    expect(options.replyTo).toBe('familia@exemplo.com');
    expect(String(options.subject).length).toBeGreaterThan(0);
    expect(String(options.html)).toContain('Definir minha senha');
    expect(String(options.text)).toContain(convite.url);

    // O envelope gerado pelo jsonTransport confirma o que seria entregue.
    const info = await sendMail.mock.results[0].value;
    const message = JSON.parse(info.message);
    expect(message.from.name).toBe('BENJAMIM ABC');
    expect(message.to[0].address).toBe(DESTINATARIO);

    expect(audit).not.toHaveBeenCalled();
  });

  it('com transporte que lança devolve { ok: false } sem exceção e audita sem o endereço', async () => {
    vi.spyOn(getTransport(), 'sendMail').mockRejectedValue(
      new Error(`550 caixa inexistente <${DESTINATARIO}>`),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendEmail('convite-admin', DESTINATARIO, convite)).resolves.toEqual({ ok: false });

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith('email.failed', { meta: { template: 'convite-admin' } });
    // Nem a auditoria nem o log carregam o endereço do destinatário.
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain(DESTINATARIO);
    expect(JSON.stringify(error.mock.calls)).not.toContain(DESTINATARIO);
  });

  it('não lança nem quando o transporte lança de forma síncrona e a auditoria falha', async () => {
    vi.spyOn(getTransport(), 'sendMail').mockImplementation(() => {
      throw new Error('transporte quebrado');
    });
    vi.mocked(audit).mockRejectedValueOnce(new Error('banco fora do ar'));

    await expect(sendEmail('convite-admin', DESTINATARIO, convite)).resolves.toEqual({ ok: false });
  });
});
