import { describe, expect, it } from 'vitest';
import { UNKNOWN_IP, getClientIp } from '@/server/client-ip';

const request = (headers: Record<string, string> = {}) => new Request('http://x/', { headers });
const ipOf = (forwardedFor: string) => getClientIp(request({ 'x-forwarded-for': forwardedFor }));

describe('getClientIp', () => {
  it('valor único (o que o Caddy grava) é o IP do cliente', () => {
    expect(ipOf('203.0.113.7')).toBe('203.0.113.7');
  });

  it('em lista, vale o último valor: o que o proxy acrescentou', () => {
    expect(ipOf('198.51.100.1, 203.0.113.7')).toBe('203.0.113.7');
    expect(ipOf('198.51.100.1,10.0.0.9 ,  203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('trocar o começo da lista não muda o IP: cliente não ganha limite novo inventando o cabeçalho', () => {
    const seen = new Set(
      ['1.1.1.1', '2.2.2.2', 'qualquer coisa', ''].map((fake) => ipOf(`${fake}, 203.0.113.7`)),
    );
    expect([...seen]).toEqual(['203.0.113.7']);
  });

  it('aceita IPv6, com ou sem colchetes, e IPv4 mapeado em IPv6', () => {
    expect(ipOf('2001:DB8::1')).toBe('2001:db8::1');
    expect(ipOf('[2001:db8::1]')).toBe('2001:db8::1');
    expect(ipOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('sem cabeçalho, vazio ou com texto que não é IP: todos caem na mesma chave', () => {
    expect(getClientIp(request())).toBe(UNKNOWN_IP);
    expect(ipOf('')).toBe(UNKNOWN_IP);
    expect(ipOf('203.0.113.7, ')).toBe(UNKNOWN_IP);
    expect(ipOf('não-é-ip')).toBe(UNKNOWN_IP);
    expect(ipOf('203.0.113.7:4444')).toBe(UNKNOWN_IP);
    expect(ipOf('a'.repeat(5000))).toBe(UNKNOWN_IP);
  });

  it('não lê X-Real-IP (o proxy não define e o cliente poderia mandar)', () => {
    expect(getClientIp(request({ 'x-real-ip': '203.0.113.7' }))).toBe(UNKNOWN_IP);
  });
});
