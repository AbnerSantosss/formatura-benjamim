import { test, expect } from 'vitest';
import {
  contributorSchema,
  cpfSchema,
  emailSchema,
  nameSchema,
  newOrderSchema,
  phoneSchema,
} from '@/domain/validation';

// CPF de exemplo com dígitos verificadores corretos; não pertence a uma pessoa real conhecida.
const validCpf = '529.982.247-25';
const contributor = {
  name: 'Maria da Silva',
  cpf: validCpf,
  phone: '(85) 99999-9999',
  email: 'maria@example.com',
};
const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
const newOrder = {
  productId: 'produto-1',
  mode: 'NUMBERS',
  amountCents: 500,
  numbers,
  contributor,
  idempotencyKey: '3f2b8c1e-5d47-4a9b-8e6f-1c2d3e4f5a6b',
};

test('CPF válido com máscara passa e sai só com dígitos', () => {
  expect(cpfSchema.parse(validCpf)).toBe('52998224725');
});
test('CPF 111.111.111-11 falha', () => {
  expect(cpfSchema.safeParse('111.111.111-11').success).toBe(false);
});
test('CPF com dígito verificador errado falha com mensagem em português', () => {
  const result = cpfSchema.safeParse('529.982.247-26');
  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.message)).toEqual(['CPF inválido.']);
  expect(cpfSchema.safeParse('529.982.247-2').error?.issues.map((issue) => issue.message)).toEqual([
    'O CPF deve ter 11 dígitos.',
  ]);
});
test('telefone (85) 99999-9999 passa e sai só com dígitos', () => {
  expect(phoneSchema.parse('(85) 99999-9999')).toBe('85999999999');
  expect(phoneSchema.parse('(85) 3333-4444')).toBe('8533334444');
});
test('telefone com 9 dígitos falha e DDD abaixo de 11 também', () => {
  expect(phoneSchema.safeParse('99999-9999').success).toBe(false);
  expect(phoneSchema.safeParse('(10) 99999-9999').success).toBe(false);
});
test('e-mail com maiúsculas é normalizado', () => {
  expect(emailSchema.parse('  Maria.Silva@Example.COM ')).toBe('maria.silva@example.com');
  expect(emailSchema.safeParse('maria@').success).toBe(false);
});
test('nome exige pelo menos duas palavras', () => {
  expect(nameSchema.parse('  Maria da Silva ')).toBe('Maria da Silva');
  expect(nameSchema.safeParse('Maria').success).toBe(false);
  expect(nameSchema.safeParse('Jo').success).toBe(false);
});
test('contribuinte e pedido válidos passam normalizados', () => {
  expect(contributorSchema.parse(contributor)).toEqual({
    name: 'Maria da Silva',
    cpf: '52998224725',
    phone: '85999999999',
    email: 'maria@example.com',
  });
  expect(newOrderSchema.parse(newOrder).numbers).toEqual(numbers);
});
test('numbers com repetição falha', () => {
  expect(newOrderSchema.safeParse({ ...newOrder, numbers: [...numbers.slice(1), 2] }).success).toBe(false);
});
test('numbers com 5001 falha', () => {
  expect(newOrderSchema.safeParse({ ...newOrder, numbers: [...numbers.slice(1), 5001] }).success).toBe(false);
  expect(newOrderSchema.safeParse({ ...newOrder, numbers: [...numbers.slice(1), 0] }).success).toBe(false);
});
test('pedido rejeita valor fora do limite, modo desconhecido e chave que não é uuid', () => {
  expect(newOrderSchema.safeParse({ ...newOrder, amountCents: 10000001 }).success).toBe(false);
  expect(newOrderSchema.safeParse({ ...newOrder, amountCents: 5.5 }).success).toBe(false);
  expect(newOrderSchema.safeParse({ ...newOrder, amountCents: 0 }).success).toBe(false);
  expect(newOrderSchema.safeParse({ ...newOrder, mode: 'numbers' }).success).toBe(false);
  expect(newOrderSchema.safeParse({ ...newOrder, idempotencyKey: 'abc' }).success).toBe(false);
});
