import {
  button,
  COLORS,
  escapeHtml,
  formatDataFortaleza,
  layout,
  para,
  resolveSiteUrl,
  textFooter,
  type RenderedEmail,
} from './base';

/** E-mail para administradores: resumo do sorteio e hash de auditoria. Não contém dados pessoais dos compradores. */
export interface SorteioRealizadoData {
  /** Número sorteado, já formatado. */
  numero: string;
  /** Quantidade de números elegíveis no momento do sorteio. */
  totalElegiveis: number;
  /** Momento do sorteio em UTC. */
  realizadoEm: Date;
  /** Hash de auditoria do sorteio. */
  hash: string;
  /** Link do painel do admin para ver o sorteio. */
  linkAdmin: string;
  siteUrl?: string;
}

export function render(data: SorteioRealizadoData): RenderedEmail {
  const site = resolveSiteUrl(data.siteUrl, data.linkAdmin);
  const subject = `Sorteio realizado — número ${data.numero}`;
  const quando = formatDataFortaleza(data.realizadoEm);
  const elegiveis = String(data.totalElegiveis);

  const bodyHtml = [
    para('O sorteio da campanha foi realizado.'),
    para(`Número sorteado: <strong>${escapeHtml(data.numero)}</strong>`),
    para(`Números elegíveis: ${escapeHtml(elegiveis)}`),
    para(`Realizado em: ${escapeHtml(quando)} (horário de Fortaleza)`),
    para('Hash de auditoria:', 'margin-bottom:4px;'),
    `<p style="margin:0 0 16px;padding:12px 14px;background:${COLORS.fundo};border-radius:12px;font-family:Consolas, 'Courier New', monospace;font-size:12px;line-height:1.5;color:${COLORS.texto};word-break:break-all;">${escapeHtml(data.hash)}</p>`,
    button('Abrir o painel', data.linkAdmin),
  ].join('\n');

  const html = layout({
    title: subject,
    preheader: `Número sorteado: ${data.numero}`,
    bodyHtml,
    siteUrl: site,
  });

  const text = [
    'O sorteio da campanha foi realizado.',
    '',
    `Número sorteado: ${data.numero}`,
    `Números elegíveis: ${elegiveis}`,
    `Realizado em: ${quando} (horário de Fortaleza)`,
    `Hash de auditoria: ${data.hash}`,
    '',
    `Abrir o painel: ${data.linkAdmin}`,
    '',
    textFooter(site),
  ].join('\n');

  return { subject, html, text };
}
