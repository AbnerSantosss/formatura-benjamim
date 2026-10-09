import { describe, expect, it, vi } from 'vitest';

// `src/server/env.ts` lê `process.env` ao ser importado: o mínimo precisa existir antes do import.
// A chave é fixa e só de teste.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3180';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5443/test';
  process.env.PAYMENT_GATEWAY = 'demo';
  process.env.CPF_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
});

import {
  decryptCpf,
  decryptGatewaySecrets,
  encryptCpf,
  encryptGatewaySecrets,
  randomToken,
  sha256Hex,
  timingSafeEqualHex,
} from '@/server/crypto';

const CPF = '52998224725';

describe('CPF cifrado em repouso', () => {
  it('cifra e decifra de volta', () => {
    const cipher = encryptCpf(CPF);
    expect(cipher).not.toContain(CPF);
    expect(cipher.split('.')).toHaveLength(3);
    expect(decryptCpf(cipher)).toBe(CPF);
  });

  it('o mesmo CPF gera textos cifrados diferentes (IV aleatório)', () => {
    const first = encryptCpf(CPF);
    const second = encryptCpf(CPF);
    expect(first).not.toBe(second);
    expect(decryptCpf(first)).toBe(decryptCpf(second));
  });

  it('recusa texto adulterado', () => {
    const [iv, tag, data] = encryptCpf(CPF).split('.');
    const bytes = Buffer.from(data, 'base64');
    bytes[0] ^= 0x01;
    expect(() => decryptCpf([iv, tag, bytes.toString('base64')].join('.'))).toThrow();

    const otherTag = Buffer.from(tag, 'base64');
    otherTag[0] ^= 0x01;
    expect(() => decryptCpf([iv, otherTag.toString('base64'), data].join('.'))).toThrow();
  });

  it('recusa formato inválido com mensagem que não traz o conteúdo', () => {
    expect(() => decryptCpf('não-é-cifra')).toThrow('CPF cifrado em formato inválido.');
    expect(() => decryptCpf('YQ==.YQ==.YQ==')).toThrow('CPF cifrado em formato inválido.');
  });
});

describe('tokens e comparação', () => {
  it('sha256Hex devolve o hash conhecido', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('randomToken entrega o valor bruto e guarda só o hash', () => {
    const first = randomToken();
    const second = randomToken();
    expect(first.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toBe(sha256Hex(first.raw));
    expect(first.raw).not.toBe(second.raw);
    expect(randomToken(16).raw).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('timingSafeEqualHex só aceita hexadecimais iguais', () => {
    const hash = sha256Hex('segredo');
    expect(timingSafeEqualHex(hash, hash)).toBe(true);
    expect(timingSafeEqualHex(hash, hash.toUpperCase())).toBe(true);
    expect(timingSafeEqualHex(hash, sha256Hex('outro'))).toBe(false);
    expect(timingSafeEqualHex(hash, hash.slice(0, -2))).toBe(false);
    expect(timingSafeEqualHex('', '')).toBe(false);
    expect(timingSafeEqualHex('abc', 'abc')).toBe(false);
    expect(timingSafeEqualHex('zz', 'zz')).toBe(false);
  });
});

describe('credenciais de gateway cifradas em repouso', () => {
  const PLAIN = JSON.stringify({ accessToken: 'token-de-teste', webhookSecret: 'segredo-de-teste' });

  it('cifra e decifra de volta, com IV aleatório', () => {
    const first = encryptGatewaySecrets(PLAIN);
    const second = encryptGatewaySecrets(PLAIN);
    expect(first).not.toContain('token-de-teste');
    expect(first).not.toBe(second);
    expect(decryptGatewaySecrets(first)).toBe(PLAIN);
    expect(decryptGatewaySecrets(second)).toBe(PLAIN);
  });

  it('texto adulterado ou em formato errado não decifra', () => {
    const [iv, tag, data] = encryptGatewaySecrets(PLAIN).split('.');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(() => decryptGatewaySecrets([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
    expect(() => decryptGatewaySecrets('nada-cifrado')).toThrow('Credenciais cifradas em formato inválido.');
  });

  it('usa chave derivada: o texto cifrado de gateway não abre como CPF e vice-versa', () => {
    expect(() => decryptCpf(encryptGatewaySecrets(PLAIN))).toThrow();
    expect(() => decryptGatewaySecrets(encryptCpf(CPF))).toThrow();
  });
});
