import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next 16: este arquivo substitui o antigo `middleware.ts`.
// Aqui só se olha a PRESENÇA do cookie. Sem banco: a validação de verdade (cookie ↔ sessão)
// fica em `requireAdmin()` / `getAdminOrNull()` (src/server/auth/require-admin.ts).

// Mesmo literal de SESSION_COOKIE em src/server/auth/session.ts (não importado para o proxy
// não puxar Prisma).
const SESSION_COOKIE = 'bj_admin';

const PUBLIC_PREFIXES = ['/admin/esqueci-senha', '/admin/redefinir', '/admin/convite'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith('/admin') &&
    pathname !== '/admin' &&
    !PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/admin?next=' + encodeURIComponent(pathname), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
