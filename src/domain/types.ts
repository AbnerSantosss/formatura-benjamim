// Tipos de domínio independentes de Prisma, de React e do navegador.
export type OrderMode = 'NUMBERS' | 'EXTRA';
export type OrderStatus = 'PENDING' | 'APPROVED' | 'EXPIRED' | 'CANCELED' | 'REFUNDED';

export type ContributorInput = {
  name: string;
  cpf: string;
  phone: string;
  email: string;
};

export type NewOrderInput = {
  productId: string;
  mode: OrderMode;
  /** Valor do pedido em centavos inteiros. */
  amountCents: number;
  /** Números escolhidos (1..5000). Vazio em colaboração avulsa. */
  numbers: number[];
  contributor: ContributorInput;
  idempotencyKey: string;
};
