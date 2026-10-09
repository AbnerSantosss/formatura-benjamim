import { isIP } from 'node:net';

// IP do cliente para os limitadores (`src/server/rate-limit.ts`) e para a sessão.
//
// Em produção o app só é alcançado pelo Caddy (`docker-compose.yml`: o serviço `app` usa `expose`,
// sem porta publicada). O Caddy 2, sem `trusted_proxies` no Caddyfile, descarta o `X-Forwarded-For`
// que o cliente mandou e grava nele o endereço de quem abriu a conexão; com `trusted_proxies`, ele
// acrescenta esse endereço ao fim da lista. Nos dois casos o ÚLTIMO valor da lista é o que o nosso
// proxy viu, e é o único que o cliente não consegue inventar. O primeiro valor (usado até a T22)
// é texto livre do cliente quando há qualquer proxy que preserve a lista.
//
// Sem proxy na frente (desenvolvimento, E2E), o Next preenche `x-forwarded-for` com o endereço do
// socket quando o cabeçalho não vem; se vier, vale o que o cliente mandou. Por isso a porta do app
// nunca deve ser publicada em produção.
//
// `X-Real-IP` não é lido: o Caddy não o define e o cliente poderia mandá-lo.

/** Chave usada quando não há IP utilizável: todas essas requisições dividem o mesmo limite. */
export const UNKNOWN_IP = 'desconhecido';

/** Tira colchetes de IPv6 (`[::1]`) e o prefixo de IPv4 mapeado em IPv6 (`::ffff:1.2.3.4`). */
function normalize(value: string): string {
  let ip = value.trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return ip.toLowerCase();
}

/**
 * IP do cliente: o último valor de `X-Forwarded-For` (o que o proxy reverso acrescentou).
 * Valor ausente ou que não é um IP vira `UNKNOWN_IP`, nunca texto livre do cliente.
 */
export function getClientIp(req: Request): string {
  const header = req.headers.get('x-forwarded-for');
  if (!header) return UNKNOWN_IP;
  const last = header.split(',').at(-1) ?? '';
  const ip = normalize(last);
  return isIP(ip) ? ip : UNKNOWN_IP;
}
