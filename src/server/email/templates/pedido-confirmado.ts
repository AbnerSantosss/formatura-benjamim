import {
  button,
  escapeHtml,
  formatBRL,
  formatDataFortaleza,
  layout,
  para,
  resolveSiteUrl,
  textFooter,
  COLORS,
  type RenderedEmail,
} from './base';

export interface PedidoConfirmadoData {
  nome: string;
  /** Valor pago em centavos inteiros. */
  valorCentavos: number;
  produto: string;
  /** Números comprados (já formatados), quando o produto é NUMBERS. */
  numeros?: string[];
  /** Link /obrigado/[id]?t=... */
  linkObrigado: string;
  /** Data do sorteio em UTC, quando configurada. */
  dataSorteio?: Date | null;
  siteUrl?: string;
}

export function render(data: PedidoConfirmadoData): RenderedEmail {
  const site = resolveSiteUrl(data.siteUrl, data.linkObrigado);
  const subject = 'Recebemos sua contribuição 💛';
  const valor = formatBRL(data.valorCentavos);
  const numeros = data.numeros ?? [];
  const sorteio = data.dataSorteio ? formatDataFortaleza(data.dataSorteio) : null;

  const numerosHtml =
    numeros.length > 0
      ? `${para('Seus números:')}
<p style="margin:0 0 16px;padding:14px 16px;background:${COLORS.fundo};border-radius:12px;font-family:Nunito, Arial, sans-serif;font-size:16px;line-height:1.8;color:${COLORS.verde};font-weight:700;word-break:break-word;">${numeros.map((n) => escapeHtml(n)).join(' &middot; ')}</p>`
      : '';

  const bodyHtml = [
    para(`Olá, ${escapeHtml(data.nome)}!`),
    para(
      `Recebemos sua contribuição de <strong>${escapeHtml(valor)}</strong> (${escapeHtml(data.produto)}). Obrigado por ajudar o Benjamim!`,
    ),
    numerosHtml,
    sorteio ? para(`O sorteio será em ${escapeHtml(sorteio)}, no horário de Fortaleza.`) : '',
    button('Ver minha confirmação', data.linkObrigado),
  ]
    .filter((bloco) => bloco !== '')
    .join('\n');

  const html = layout({
    title: subject,
    preheader: `Sua contribuição de ${valor} foi recebida`,
    bodyHtml,
    siteUrl: site,
  });

  const text = [
    `Olá, ${data.nome}!`,
    '',
    `Recebemos sua contribuição de ${valor} (${data.produto}). Obrigado por ajudar o Benjamim!`,
    ...(numeros.length > 0 ? ['', `Seus números: ${numeros.join(', ')}`] : []),
    ...(sorteio ? ['', `O sorteio será em ${sorteio}, no horário de Fortaleza.`] : []),
    '',
    `Ver minha confirmação: ${data.linkObrigado}`,
    '',
    textFooter(site),
  ].join('\n');

  return { subject, html, text };
}
