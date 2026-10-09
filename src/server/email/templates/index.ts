import { render as conviteAdmin } from './convite-admin';
import { render as ganhador } from './ganhador';
import { render as pedidoConfirmado } from './pedido-confirmado';
import { render as pedidoCriado } from './pedido-criado';
import { render as redefinirSenha } from './redefinir-senha';
import { render as sorteioRealizado } from './sorteio-realizado';

export type { RenderedEmail } from './base';

export const templates = {
  'convite-admin': conviteAdmin,
  'redefinir-senha': redefinirSenha,
  'pedido-confirmado': pedidoConfirmado,
  'pedido-criado': pedidoCriado,
  ganhador,
  'sorteio-realizado': sorteioRealizado,
};

export type TemplateName = keyof typeof templates;

export type TemplateData<N extends TemplateName> = Parameters<(typeof templates)[N]>[0];
