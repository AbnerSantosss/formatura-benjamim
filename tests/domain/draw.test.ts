import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DrawError, participantsHash, pickWinner, type Participant } from '@/domain/draw';

const lista: Participant[] = [
  { number: 7, orderId: 'pedido-a' },
  { number: 12, orderId: 'pedido-a' },
  { number: 30, orderId: 'pedido-b' },
  { number: 1500, orderId: 'pedido-c' },
];
const invertida = [...lista].reverse();
const embaralhada = [lista[2], lista[0], lista[3], lista[1]];

describe('participantsHash', () => {
  it('é o sha256 das linhas numero:pedido em ordem crescente de número', () => {
    const esperado = createHash('sha256')
      .update('7:pedido-a\n12:pedido-a\n30:pedido-b\n1500:pedido-c')
      .digest('hex');
    expect(participantsHash(lista)).toBe(esperado);
    expect(participantsHash(lista)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('é igual para listas em ordens diferentes', () => {
    expect(participantsHash(invertida)).toBe(participantsHash(lista));
    expect(participantsHash(embaralhada)).toBe(participantsHash(lista));
  });

  it('muda quando muda um participante', () => {
    const outra = [...lista.slice(0, 3), { number: 1501, orderId: 'pedido-c' }];
    expect(participantsHash(outra)).not.toBe(participantsHash(lista));
    const outroPedido = [...lista.slice(0, 3), { number: 1500, orderId: 'pedido-d' }];
    expect(participantsHash(outroPedido)).not.toBe(participantsHash(lista));
  });

  it('não altera a lista recebida', () => {
    const copia = [...invertida];
    participantsHash(invertida);
    expect(invertida).toEqual(copia);
  });
});

describe('pickWinner', () => {
  it('devolve o participante do índice entregue por randomInt, na lista ordenada', () => {
    for (let index = 0; index < lista.length; index += 1) {
      const pedidos: number[] = [];
      const resultado = pickWinner(embaralhada, (max) => {
        pedidos.push(max);
        return index;
      });
      expect(pedidos).toEqual([lista.length]);
      expect(resultado.index).toBe(index);
      expect(resultado.winner).toEqual(lista[index]);
      expect(resultado.eligibleCount).toBe(lista.length);
      expect(resultado.hash).toBe(participantsHash(lista));
    }
  });

  it('lista vazia lança NO_PARTICIPANTS sem consultar randomInt', () => {
    let chamadas = 0;
    const sortear = () =>
      pickWinner([], () => {
        chamadas += 1;
        return 0;
      });
    expect(sortear).toThrow(DrawError);
    try {
      sortear();
    } catch (error) {
      expect((error as DrawError).code).toBe('NO_PARTICIPANTS');
    }
    expect(chamadas).toBe(0);
  });

  it('recusa índice fora do intervalo ou não inteiro', () => {
    for (const ruim of [-1, lista.length, 1.5, Number.NaN]) {
      expect(() => pickWinner(lista, () => ruim)).toThrow(DrawError);
    }
  });
});
