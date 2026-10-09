import {
  button,
  COLORS,
  escapeHtml,
  formatBRL,
  formatDataFortaleza,
  layout,
  para,
  resolveSiteUrl,
  textFooter,
  type RenderedEmail,
} from './base';

export interface PedidoCriadoData {
  nome: string;
  /** Valor da cobrança em centavos inteiros. */
  valorCentavos: number;
  produto: string;
  /** Código Pix copia e cola. */
  pixCopiaECola: string;
  /** Validade da cobrança, em UTC. */
  expiraEm: Date;
  /** Link de pagamento /pagamento/[id]?t=... */
  linkPagamento: string;
  siteUrl?: string;
}

export function render(data: PedidoCriadoData): RenderedEmail {
  const site = resolveSiteUrl(data.siteUrl, data.linkPagamento);
  const subject = 'Seu Pix para a campanha do Benjamim';
  const valor = formatBRL(data.valorCentavos);
  const validade = formatDataFortaleza(data.expiraEm);

  const bodyHtml = [
    para(`Olá, ${escapeHtml(data.nome)}!`),
    para(
      `Seu pedido de <strong>${escapeHtml(valor)}</strong> (${escapeHtml(data.produto)}) está aguardando o pagamento via Pix.`,
    ),
    para('Copie o código abaixo e cole no app do seu banco, na opção Pix copia e cola:'),
    `<p style="margin:0 0 16px;padding:14px 16px;background:${COLORS.fundo};border-radius:12px;font-family:Consolas, 'Courier New', monospace;font-size:13px;line-height:1.5;color:${COLORS.texto};word-break:break-all;">${escapeHtml(data.pixCopiaECola)}</p>`,
    para(
      `Válido até ${escapeHtml(validade)} (horário de Fortaleza).`,
      `font-size:14px;color:${COLORS.cinza};`,
    ),
    button('Ver pagamento', data.linkPagamento),
  ].join('\n');

  const html = layout({
    title: subject,
    preheader: `Pix de ${valor} para confirmar sua contribuição`,
    bodyHtml,
    siteUrl: site,
  });

  const text = [
    `Olá, ${data.nome}!`,
    '',
    `Seu pedido de ${valor} (${data.produto}) está aguardando o pagamento via Pix.`,
    '',
    'Copie o código abaixo e cole no app do seu banco, na opção Pix copia e cola:',
    data.pixCopiaECola,
    '',
    `Válido até ${validade} (horário de Fortaleza).`,
    '',
    `Ver pagamento: ${data.linkPagamento}`,
    '',
    textFooter(site),
  ].join('\n');

  return { subject, html, text };
}
