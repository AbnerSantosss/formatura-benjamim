// Base dos e-mails transacionais: funções puras, sem env, banco ou transporte.
// Todo valor dinâmico passa por escapeHtml antes de entrar no HTML.

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const COLORS = {
  fundo: '#f7f2e8',
  verde: '#2f5d50',
  laranja: '#d99a6c',
  texto: '#2b2b2b',
  cinza: '#6b6b6b',
  borda: '#e6dccb',
} as const;

const FONT = 'Nunito, Arial, sans-serif';

export const FOOTER_TEXT = 'Você recebeu este e-mail porque participou da campanha do Benjamim.';

export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Valor inteiro em centavos para "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error('valor monetário deve ser inteiro em centavos');
  const sinal = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = String(abs % 100).padStart(2, '0');
  return `${sinal}R$ ${reais},${centavos}`;
}

/** Data em UTC para exibição no horário de Fortaleza (America/Fortaleza). */
export function formatDataFortaleza(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

/** Origem do site: usa siteUrl se vier, senão a origem de um link absoluto do próprio e-mail. */
export function resolveSiteUrl(siteUrl: string | undefined, link: string): string {
  if (siteUrl) return siteUrl.replace(/\/+$/, '');
  return new URL(link).origin;
}

export function textFooter(siteUrl: string): string {
  return `${FOOTER_TEXT}\nContato e privacidade: ${siteUrl}/privacidade`;
}

/** Parágrafo. Recebe HTML já escapado (use escapeHtml em valores dinâmicos). */
export function para(html: string, estilo = ''): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLORS.texto};${estilo}">${html}</p>`;
}

/** Botão em forma de pílula. Label e URL são escapados aqui. */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px;">
  <tr>
    <td align="center" bgcolor="${COLORS.verde}" style="border-radius:999px;background:${COLORS.verde};">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 24px;border-radius:999px;background:${COLORS.verde};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/** Link de texto puro (para "se o botão não funcionar"). */
export function linkCopiavel(url: string): string {
  const seguro = escapeHtml(url);
  return para(
    `Se o botão não funcionar, copie este endereço:<br><a href="${seguro}" style="color:${COLORS.verde};word-break:break-all;">${seguro}</a>`,
    `font-size:14px;color:${COLORS.cinza};`,
  );
}

export function layout(opts: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  siteUrl: string;
}): string {
  const site = escapeHtml(opts.siteUrl.replace(/\/+$/, ''));
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.fundo};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.fundo};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td align="center" style="padding:0 0 16px;">
            <img src="${site}/images/benjamim-email.png" width="120" height="120" alt="Benjamim" style="display:block;width:120px;height:120px;border:0;border-radius:60px;margin:0 auto;">
            <div style="font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:1px;color:${COLORS.verde};padding-top:8px;">BENJAMIM ABC</div>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid ${COLORS.borda};border-radius:16px;padding:32px 28px;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLORS.texto};">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 12px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLORS.cinza};">
            ${escapeHtml(FOOTER_TEXT)}<br>
            <a href="${site}/privacidade" style="color:${COLORS.cinza};">Contato e privacidade</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
