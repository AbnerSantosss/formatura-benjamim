// Dinheiro é sempre inteiro em centavos; estas funções só convertem para exibição e de volta.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Converte texto digitado em reais para centavos inteiros, sem passar por ponto flutuante.
 * Aceita "5", "7,25", "R$ 1.234,56" e "1234.56". Devolve `null` se não for um valor válido.
 */
export function parseBRLToCents(input: string): number | null {
  const text = input.replace(/R\$/i, '').replace(/\s/g, '');
  let integer: string;
  let fraction = '';
  if (text.includes(',')) {
    // Formato brasileiro: ponto separa milhar, vírgula separa centavos.
    const match = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(text);
    if (!match) return null;
    integer = match[1].replace(/\./g, '');
    fraction = match[2];
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    integer = text.replace(/\./g, '');
  } else {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) return null;
    integer = match[1];
    fraction = match[2] || '';
  }
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
