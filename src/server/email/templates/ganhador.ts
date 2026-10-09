import {
  button,
  COLORS,
  escapeHtml,
  layout,
  para,
  resolveSiteUrl,
  textFooter,
  type RenderedEmail,
} from './base';

export interface GanhadorData {
  nome: string;
  /** Número sorteado, já formatado (ex.: "0042"). */
  numero: string;
  premio: string;
  /** Instruções de contato para retirar o prêmio. Padrão: responder ao e-mail. */
  instrucoes?: string;
  /** Link /obrigado/[id]?t=... do pedido premiado. */
  linkConfirmacao: string;
  siteUrl?: string;
}

const INSTRUCOES_PADRAO = 'Responda a este e-mail para combinarmos os detalhes.';

export function render(data: GanhadorData): RenderedEmail {
  const site = resolveSiteUrl(data.siteUrl, data.linkConfirmacao);
  const subject = 'Seu número foi sorteado! 🎉';
  const instrucoes = data.instrucoes ?? INSTRUCOES_PADRAO;

  const bodyHtml = [
    para(`Olá, ${escapeHtml(data.nome)}!`),
    para('Temos uma ótima notícia: o seu número foi sorteado.'),
    `<p style="margin:0 0 16px;padding:18px 16px;background:${COLORS.fundo};border-radius:12px;text-align:center;font-family:Nunito, Arial, sans-serif;font-size:28px;line-height:1.2;color:${COLORS.verde};font-weight:700;">${escapeHtml(data.numero)}</p>`,
    para(`Prêmio: <strong>${escapeHtml(data.premio)}</strong>`),
    para(escapeHtml(instrucoes)),
    button('Ver minha confirmação', data.linkConfirmacao),
  ].join('\n');

  const html = layout({
    title: subject,
    preheader: `Seu número ${data.numero} foi sorteado`,
    bodyHtml,
    siteUrl: site,
  });

  const text = [
    `Olá, ${data.nome}!`,
    '',
    'Temos uma ótima notícia: o seu número foi sorteado.',
    '',
    `Número sorteado: ${data.numero}`,
    `Prêmio: ${data.premio}`,
    '',
    instrucoes,
    '',
    `Ver minha confirmação: ${data.linkConfirmacao}`,
    '',
    textFooter(site),
  ].join('\n');

  return { subject, html, text };
}
