// Conteúdo centralizado para a próxima etapa de desenvolvimento.
// Valores em centavos. O total inicial não representa uma consulta ao gateway.
export const campaign = {
  goal: 250000,
  raised: 0,
  amounts: [500, 1000, 2500, 5000],
  defaultAmount: 2500,
  instagramFather: '',
  instagramMother: '',
};
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function resolveAmount(value: string | undefined) {
  const cents = Number(value) * 100;
  return campaign.amounts.includes(cents) ? cents : campaign.defaultAmount;
}
