import 'server-only';
import { AppError, ForbiddenError } from '@/server/errors';
import { getSession, type AuthContext } from './session';

export type RequireAdminOptions = {
  /** Exige papel OWNER. */
  role?: 'OWNER';
  /** Permite seguir mesmo com troca de senha pendente (rotas `me`, `trocar-senha`, `logout`). */
  allowPasswordChangePending?: boolean;
};

/**
 * Valida a sessão no banco. Lança:
 * - `AppError('UNAUTHORIZED', 401)` sem sessão válida;
 * - `AppError('PASSWORD_CHANGE_REQUIRED', 403)` enquanto `mustChangePassword` estiver ligado;
 * - `ForbiddenError` se a rota exigir OWNER e o admin não for.
 */
export async function requireAdmin(opts: RequireAdminOptions = {}): Promise<AuthContext> {
  const auth = await getSession();
  if (!auth) {
    throw new AppError('UNAUTHORIZED', 'Faça login para continuar.', 401);
  }
  if (auth.admin.mustChangePassword && !opts.allowPasswordChangePending) {
    throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Defina uma nova senha antes de continuar.', 403);
  }
  if (opts.role === 'OWNER' && auth.admin.role !== 'OWNER') {
    throw new ForbiddenError();
  }
  return auth;
}

/** Para Server Components: devolve a sessão ou `null`, sem lançar. */
export async function getAdminOrNull(): Promise<AuthContext | null> {
  return getSession();
}

/**
 * Converte um erro em resposta JSON `{ code, message }` para as rotas de `/api/admin/auth/**`.
 * Erro que não é `AppError` vira 500 genérico, sem detalhe, e sem ir para o log com dados da requisição.
 */
export function authErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  }
  console.error('[auth] erro inesperado:', error instanceof Error ? error.name : 'desconhecido');
  return Response.json(
    { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir agora. Tente novamente.' },
    { status: 500 },
  );
}
