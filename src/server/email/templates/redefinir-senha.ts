import {
  button,
  escapeHtml,
  layout,
  linkCopiavel,
  para,
  resolveSiteUrl,
  textFooter,
  type RenderedEmail,
} from './base';

export interface RedefinirSenhaData {
  nome: string;
  /** Link com token de redefinição (válido 1 h). */
  url: string;
  siteUrl?: string;
}

export function render(data: RedefinirSenhaData): RenderedEmail {
  const site = resolveSiteUrl(data.siteUrl, data.url);
  const subject = 'Redefinição de senha — painel da campanha';

  const bodyHtml = [
    para(`Olá, ${escapeHtml(data.nome)}!`),
    para('Recebemos um pedido para redefinir a senha do seu acesso ao painel da campanha.'),
    para('Clique no botão abaixo para criar uma nova senha. O link vale por 1 hora.'),
    button('Criar nova senha', data.url),
    linkCopiavel(data.url),
    para(
      'Se você não pediu a redefinição, ignore este e-mail: sua senha atual continua valendo. Não compartilhe este link com ninguém.',
      'font-size:14px;color:#6b6b6b;',
    ),
  ].join('\n');

  const html = layout({
    title: subject,
    preheader: 'Crie uma nova senha para o painel',
    bodyHtml,
    siteUrl: site,
  });

  const text = [
    `Olá, ${data.nome}!`,
    '',
    'Recebemos um pedido para redefinir a senha do seu acesso ao painel da campanha.',
    '',
    'Use o link abaixo para criar uma nova senha. O link vale por 1 hora.',
    '',
    `Criar nova senha: ${data.url}`,
    '',
    'Se você não pediu a redefinição, ignore este e-mail: sua senha atual continua valendo. Não compartilhe este link com ninguém.',
    '',
    textFooter(site),
  ].join('\n');

  return { subject, html, text };
}
