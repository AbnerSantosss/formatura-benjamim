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

export interface ConviteAdminData {
  nome: string;
  convidadoPor: string;
  /** Link com token para definir a senha (válido 7 dias). */
  url: string;
  siteUrl?: string;
}

export function render(data: ConviteAdminData): RenderedEmail {
  const site = resolveSiteUrl(data.siteUrl, data.url);
  const subject = 'Você foi convidado para o painel da campanha do Benjamim';

  const bodyHtml = [
    para(`Olá, ${escapeHtml(data.nome)}!`),
    para(
      `${escapeHtml(data.convidadoPor)} convidou você para ajudar a administrar a campanha do Benjamim. No painel você acompanha as contribuições, os números e o sorteio.`,
    ),
    para('Clique no botão abaixo para criar sua senha e entrar. O link vale por 7 dias.'),
    button('Definir minha senha', data.url),
    linkCopiavel(data.url),
    para('Se você não esperava este convite, pode ignorar esta mensagem.'),
  ].join('\n');

  const html = layout({
    title: subject,
    preheader: 'Crie sua senha para entrar no painel',
    bodyHtml,
    siteUrl: site,
  });

  const text = [
    `Olá, ${data.nome}!`,
    '',
    `${data.convidadoPor} convidou você para ajudar a administrar a campanha do Benjamim. No painel você acompanha as contribuições, os números e o sorteio.`,
    '',
    'Clique no link abaixo para criar sua senha e entrar. O link vale por 7 dias.',
    '',
    `Definir minha senha: ${data.url}`,
    '',
    'Se você não esperava este convite, pode ignorar esta mensagem.',
    '',
    textFooter(site),
  ].join('\n');

  return { subject, html, text };
}
