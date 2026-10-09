// Conteúdo estático da campanha. Meta, arrecadado e Instagram vêm do banco (ver ADR 011).
// Valores em centavos.
export const campaign = {
  amounts: [500, 1000, 2500, 5000],
  defaultAmount: 500,
};
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function resolveAmount(value: string | undefined) {
  const cents = Number(value) * 100;
  return campaign.amounts.includes(cents) ? cents : campaign.defaultAmount;
}
