// Validação de entrada com Zod. Mensagens em português, prontas para exibir no formulário.
import { z } from 'zod';
import { TOTAL_NUMBERS } from './orders';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** Dígitos verificadores do CPF pelo módulo 11; rejeita sequências de dígitos iguais. */
function isValidCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index);
    return ((sum * 10) % 11) % 10;
  };
  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

export const cpfSchema = z
  .string({ error: 'Informe o CPF.' })
  .transform(onlyDigits)
  .pipe(
    z
      .string()
      .regex(/^\d{11}$/, { error: 'O CPF deve ter 11 dígitos.', abort: true })
      .refine(isValidCpf, { error: 'CPF inválido.' }),
  );

export const phoneSchema = z
  .string({ error: 'Informe o telefone.' })
  .transform(onlyDigits)
  .pipe(
    z
      .string()
      .regex(/^\d{10,11}$/, { error: 'O telefone deve ter DDD e 8 ou 9 dígitos.', abort: true })
      .refine((phone) => Number(phone.slice(0, 2)) >= 11, { error: 'DDD inválido.' }),
  );

export const emailSchema = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .email({ error: 'E-mail inválido.' })
  .max(160, { error: 'O e-mail deve ter no máximo 160 caracteres.' });

export const nameSchema = z
  .string({ error: 'Informe o nome completo.' })
  .trim()
  .min(3, { error: 'O nome deve ter pelo menos 3 caracteres.' })
  .max(120, { error: 'O nome deve ter no máximo 120 caracteres.' })
  .refine((name) => name.split(/\s+/).length >= 2, { error: 'Informe nome e sobrenome.' });

export const contributorSchema = z.object(
  {
    name: nameSchema,
    cpf: cpfSchema,
    phone: phoneSchema,
    email: emailSchema,
  },
  { error: 'Informe os dados de quem está contribuindo.' },
);

export const newOrderSchema = z.object(
  {
    productId: z.string({ error: 'Escolha um produto.' }).trim().min(1, { error: 'Escolha um produto.' }),
    mode: z.enum(['NUMBERS', 'EXTRA'], { error: 'Tipo de pedido inválido.' }),
    amountCents: z
      .number({ error: 'Informe o valor.' })
      .int({ error: 'O valor deve ser um número inteiro de centavos.' })
      .positive({ error: 'O valor deve ser maior que zero.' })
      .max(10000000, { error: 'O valor máximo por pedido é R$ 100.000,00.' }),
    numbers: z
      .array(
        z
          .number({ error: 'Número inválido.' })
          .int({ error: 'Número inválido.' })
          .min(1, { error: `Os números vão de 1 a ${TOTAL_NUMBERS}.` })
          .max(TOTAL_NUMBERS, { error: `Os números vão de 1 a ${TOTAL_NUMBERS}.` }),
        { error: 'Informe a lista de números.' },
      )
      .max(TOTAL_NUMBERS, { error: `Escolha no máximo ${TOTAL_NUMBERS} números.` })
      .refine((numbers) => new Set(numbers).size === numbers.length, {
        error: 'Não repita números no mesmo pedido.',
      }),
    contributor: contributorSchema,
    idempotencyKey: z.uuid({ error: 'Chave de idempotência inválida.' }),
  },
  { error: 'Pedido inválido.' },
);

export type ContributorData = z.infer<typeof contributorSchema>;
export type NewOrderData = z.infer<typeof newOrderSchema>;
