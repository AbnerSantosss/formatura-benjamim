import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '@/server/env';

// CPF cifrado em repouso com AES-256-GCM. Formato: base64(iv).base64(tag).base64(dados).
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function cpfKey(): Buffer {
  return Buffer.from(env.CPF_ENCRYPTION_KEY, 'hex');
}

export function encryptCpf(cpf: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, cpfKey(), iv);
  const data = Buffer.concat([cipher.update(cpf, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((part) => part.toString('base64')).join('.');
}

export function decryptCpf(cipher: string): string {
  const parts = cipher.split('.');
  if (parts.length !== 3) throw new Error('CPF cifrado em formato inválido.');
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('CPF cifrado em formato inválido.');
  const decipher = createDecipheriv(ALGORITHM, cpfKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// Credenciais de gateway salvas pelo painel: mesmo formato do CPF, com chave própria derivada de
// CPF_ENCRYPTION_KEY (HKDF), para que um texto cifrado de um uso não sirva no outro.
function gatewaySecretKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', cpfKey(), Buffer.alloc(0), 'gateway-config-v1', 32));
}

export function encryptGatewaySecrets(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, gatewaySecretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((part) => part.toString('base64')).join('.');
}

export function decryptGatewaySecrets(cipher: string): string {
  const parts = cipher.split('.');
  if (parts.length !== 3) throw new Error('Credenciais cifradas em formato inválido.');
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Credenciais cifradas em formato inválido.');
  }
  const decipher = createDecipheriv(ALGORITHM, gatewaySecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Token aleatório: `raw` vai para o usuário (URL, cookie); só o `hash` é guardado no banco. */
export function randomToken(bytes = 32): { raw: string; hash: string } {
  const raw = randomBytes(bytes).toString('base64url');
  return { raw, hash: sha256Hex(raw) };
}

/** Compara duas strings hexadecimais em tempo constante. Tamanho diferente ou hex inválido = falso. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0 || a.length % 2 !== 0) return false;
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
