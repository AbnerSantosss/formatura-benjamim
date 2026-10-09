import { describe, expect, it } from 'vitest';
import { hashPassword, passwordPolicy, verifyPassword } from '@/server/auth/password';

describe('hashPassword / verifyPassword', () => {
  it('gera hash bcrypt de custo 12 que confere com a senha', async () => {
    const hash = await hashPassword('senha-de-teste-123');
    expect(hash).not.toContain('senha-de-teste-123');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('senha-de-teste-123', hash)).toBe(true);
  });

  it('recusa senha diferente', async () => {
    const hash = await hashPassword('senha-de-teste-123');
    expect(await verifyPassword('senha-de-teste-124', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('senha-de-teste-123'),
      hashPassword('senha-de-teste-123'),
    ]);
    expect(a).not.toBe(b);
  });

  it('devolve false, sem lançar, para hash malformado', async () => {
    expect(await verifyPassword('senha-de-teste-123', 'isto-nao-e-hash')).toBe(false);
    expect(await verifyPassword('senha-de-teste-123', '')).toBe(false);
  });
});

describe('passwordPolicy', () => {
  it('aceita 10 caracteres com letra e número', () => {
    expect(passwordPolicy.safeParse('abcdefghi1').success).toBe(true);
  });

  it('rejeita 9 caracteres', () => {
    expect(passwordPolicy.safeParse('abcdefgh1').success).toBe(false);
  });

  it('rejeita senha sem número', () => {
    expect(passwordPolicy.safeParse('abcdefghijkl').success).toBe(false);
  });

  it('rejeita senha sem letra', () => {
    expect(passwordPolicy.safeParse('12345678901').success).toBe(false);
  });

  it('rejeita mais de 128 caracteres', () => {
    expect(passwordPolicy.safeParse('a1'.repeat(64)).success).toBe(true);
    expect(passwordPolicy.safeParse('a1'.repeat(64) + 'x').success).toBe(false);
  });
});
