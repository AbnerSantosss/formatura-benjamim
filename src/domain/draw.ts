// Regras puras do sorteio (ADR 006). Sem banco, sem relógio e sem gerador próprio de números
// aleatórios: quem chama entrega a função `randomInt`. `node:crypto` entra só para o hash.
import { createHash } from 'node:crypto';

/** Um número elegível e o pedido aprovado ao qual ele pertence. */
export type Participant = { number: number; orderId: string };

export type DrawErrorCode = 'NO_PARTICIPANTS' | 'INVALID_INDEX';

export class DrawError extends Error {
  readonly code: DrawErrorCode;

  constructor(code: DrawErrorCode, message?: string) {
    super(
      message ??
        (code === 'NO_PARTICIPANTS' ? 'Não há números participantes.' : 'Índice sorteado fora da lista.'),
    );
    this.name = 'DrawError';
    this.code = code;
  }
}

/** Cópia ordenada por número (desempate pelo id do pedido, para a ordem ser sempre a mesma). */
function sorted(list: Participant[]): Participant[] {
  return [...list].sort(
    (a, b) => a.number - b.number || (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0),
  );
}

function hashOfSorted(list: Participant[]): string {
  return createHash('sha256')
    .update(list.map((item) => `${item.number}:${item.orderId}`).join('\n'), 'utf8')
    .digest('hex');
}

/**
 * sha256 (hex) da lista ordenada por número, uma linha `${number}:${orderId}` por participante,
 * unidas por `\n`. A ordem de entrada não muda o resultado.
 */
export function participantsHash(list: Participant[]): string {
  return hashOfSorted(sorted(list));
}

/**
 * Escolhe o ganhador: ordena a lista, pede a `randomInt` um inteiro uniforme em `[0, total)` e
 * devolve o participante dessa posição. Cada número tem a mesma chance.
 * Lança `DrawError('NO_PARTICIPANTS')` com a lista vazia e `DrawError('INVALID_INDEX')` se
 * `randomInt` devolver algo fora do intervalo.
 */
export function pickWinner(
  list: Participant[],
  randomInt: (maxExclusive: number) => number,
): { winner: Participant; index: number; hash: string; eligibleCount: number } {
  if (list.length === 0) throw new DrawError('NO_PARTICIPANTS');
  const ordered = sorted(list);
  const index = randomInt(ordered.length);
  if (!Number.isInteger(index) || index < 0 || index >= ordered.length) throw new DrawError('INVALID_INDEX');
  return { winner: ordered[index], index, hash: hashOfSorted(ordered), eligibleCount: ordered.length };
}
