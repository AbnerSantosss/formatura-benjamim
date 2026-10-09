// Teste manual de e-mail: envia o template `pedido-confirmado` com dados fictícios.
//
//   npm run email:test -- --to voce@exemplo.com
//
// Com SMTP_* no .env o e-mail chega de verdade (remetente "BENJAMIM ABC");
// sem SMTP_HOST, o conteúdo é impresso no terminal (modo console).
// Nunca imprimir variáveis de ambiente aqui.

try {
  // Carrega o .env quando o script roda fora do Next. Variáveis já definidas no ambiente têm prioridade.
  process.loadEnvFile();
} catch {
  // Sem arquivo .env (CI, container): as variáveis vêm do ambiente.
}

function readTo(argv: string[]): string | undefined {
  const index = argv.indexOf('--to');
  if (index >= 0) return argv[index + 1];
  return argv.find((arg) => arg.startsWith('--to='))?.slice('--to='.length);
}

async function main(): Promise<void> {
  const to = readTo(process.argv.slice(2));
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('Uso: npm run email:test -- --to voce@exemplo.com');
    process.exitCode = 1;
    return;
  }

  // Import dinâmico: `env.ts` valida `process.env` no import, então o .env precisa estar carregado antes.
  const { env } = await import('../src/server/env');
  const { emailMode } = await import('../src/server/email/transport');
  const { sendEmail } = await import('../src/server/email/send');

  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  const modo = emailMode() === 'smtp' ? 'SMTP' : 'console (nada é enviado)';
  console.log(`[email:test] enviando "pedido-confirmado" em modo ${modo}...`);

  const { ok } = await sendEmail('pedido-confirmado', to, {
    nome: 'Maria (teste)',
    valorCentavos: 1000,
    produto: 'Cestas O Boticário',
    numeros: ['0007', '0042', '0108', '0256'],
    linkObrigado: `${siteUrl}/obrigado/pedido-de-teste?t=token-de-teste`,
    dataSorteio: new Date('2026-12-12T22:00:00.000Z'),
    siteUrl,
  });

  if (ok) {
    console.log('[email:test] ok: envio concluído.');
  } else {
    console.error('[email:test] falhou: confira SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER e SMTP_PASS.');
    process.exitCode = 1;
  }
}

void main();
