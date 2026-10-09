import 'server-only';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { getClientIp } from '@/server/client-ip';
import { env } from '@/server/env';
import { AppError, OrderConflictError, ValidationError } from '@/server/errors';

// Utilitários das rotas de API. Toda resposta de erro tem o formato `{ code, message, details? }`.
// Nenhuma resposta de API é guardada em cache (`Cache-Control: no-store`).

export type ErrorBody = { code: string; message: string; details?: unknown };

/** Resposta JSON sem cache. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return Response.json(data, { ...init, headers });
}

/**
 * Descrição curta de um erro para log e auditoria técnica. Sem dado pessoal: de erro desconhecido
 * sai só o nome da classe (a mensagem pode carregar valores da requisição ou da consulta ao banco).
 */
export function describeError(error: unknown): string {
  if (error instanceof AppError) return `${error.code}: ${error.message}`.slice(0, 300);
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `${error.name} ${error.code}`;
  return error instanceof Error ? error.name : 'erro desconhecido';
}

/** Log de erro sem PII. Respeita `LOG_LEVEL=silent`. */
export function logError(scope: string, error: unknown): void {
  if (env.LOG_LEVEL === 'silent') return;
  console.error(`[${scope}] ${describeError(error)}`);
}

/**
 * Converte um erro em resposta:
 * - `AppError` → o status do próprio erro (conflito de números sai como `NUMBERS_TAKEN` com a lista);
 * - `ZodError` → 422 com `details` (campo e mensagem, nunca o valor recebido);
 * - qualquer outro → 500 `INTERNAL`, logado sem PII.
 */
export function fail(error: unknown): Response {
  if (error instanceof OrderConflictError) {
    return json({ code: 'NUMBERS_TAKEN', message: error.message, numbers: error.numbers }, { status: 409 });
  }
  if (error instanceof AppError) {
    return json({ code: error.code, message: error.message } satisfies ErrorBody, { status: error.status });
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    const body: ErrorBody = {
      code: 'VALIDATION_ERROR',
      message: error.issues[0]?.message ?? 'Dados inválidos.',
      details,
    };
    return json(body, { status: 422 });
  }
  logError('api', error);
  const body: ErrorBody = {
    code: 'INTERNAL',
    message: 'Não foi possível concluir agora. Tente novamente.',
  };
  return json(body, { status: 500 });
}

/** 429 com `Retry-After`. */
export function tooManyRequests(
  retryAfterSec: number,
  message = 'Muitas tentativas. Aguarde um instante e tente de novo.',
): Response {
  const body: ErrorBody = { code: 'RATE_LIMITED', message };
  return json(body, { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfterSec)) } });
}

/** 429 das rotas de `/api/admin/auth/**` (janela de 15 minutos: a mensagem fala em minutos). */
export function tooManyAttempts(retryAfterSec: number): Response {
  return tooManyRequests(retryAfterSec, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
}

// IP do cliente: a única implementação fica em `src/server/client-ip.ts` (regra e motivo lá).
export { getClientIp };

/** Corpo cru, para validar assinatura de webhook. Nunca usar `req.json()` antes de validar. */
export function readRawBody(req: Request): Promise<string> {
  return req.text();
}

/** Corpo JSON de uma rota comum. Corpo ausente ou malformado vira erro 422. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return JSON.parse(await req.text()) as unknown;
  } catch {
    throw new ValidationError('Corpo da requisição inválido.');
  }
}
