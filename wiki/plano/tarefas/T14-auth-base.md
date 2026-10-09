---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-4, auth, sessao, opus]
---

# T14 — Autenticação base: senha, sessão, cookie, proxy, login/logout, primeiro admin

- **Modelo:** opus.
- **Depende de:** T03, T04.
- **Arquivos (criar):** `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/require-admin.ts`, `src/server/auth/csrf.ts`, `src/proxy.ts`, `src/app/api/admin/auth/login/route.ts`, `src/app/api/admin/auth/logout/route.ts`, `src/app/api/admin/auth/me/route.ts`, `src/app/api/admin/auth/trocar-senha/route.ts`, `scripts/admin-create.ts`, `tests/auth/password.test.ts`, `tests/integration/auth.test.ts`; (migração) `prisma/migrations/<ts>_admin_must_change_password`.
- **Ler antes:** [[fluxos/autenticacao-admin]], [[decisoes/005-autenticacao-propria]], docs do Next 16 em `node_modules/next/dist/docs/` → `proxy.md` (**não** criar `middleware.ts`) e a doc de `cookies()` (assíncrono).

## Passos
1. `npm install bcryptjs && npm install -D @types/bcryptjs`.
2. Migração: adicionar `mustChangePassword Boolean @default(false)` em `AdminUser` (`npx prisma migrate dev --name admin_must_change_password`).
3. `password.ts`: `hashPassword(plain)` (bcrypt custo 12), `verifyPassword(plain, hash)`, `passwordPolicy` Zod (mín. 10 caracteres, máx. 128, pelo menos uma letra e um número).
4. `session.ts`:
   - `createSession(adminId, remember, ctx: { ip?, userAgent? })` → gera `randomToken(32)`, grava `Session { tokenHash, remember, expiresAt (12 h ou 30 dias) }`, devolve `{ raw, expiresAt }`.
   - `setSessionCookie(raw, expiresAt)` usando `(await cookies()).set('bj_admin', raw, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt })`.
   - `getSession()` lê o cookie, `sha256Hex`, busca `Session` com `expiresAt > now` e `admin.active && admin.passwordHash != null`; renova `lastSeenAt` no máximo 1x a cada 5 min. Devolve `{ admin: { id, name, email, role, mustChangePassword }, session } | null`.
   - `destroySession()` apaga a sessão e o cookie.
5. `require-admin.ts`: `requireAdmin(opts?: { role?: 'OWNER'; allowPasswordChangePending?: boolean })` → lança `AppError('UNAUTHORIZED', 401)` ou `ForbiddenError`. Se `admin.mustChangePassword` e a opção não permitir, lança `AppError('PASSWORD_CHANGE_REQUIRED', 403)`. Para Server Components, `getAdminOrNull()`.
6. `csrf.ts`: `assertSameOrigin(req)` compara `Origin` (ou `Referer`) com `env.NEXT_PUBLIC_SITE_URL`; lança 403 se diferente. Aplicar em **toda** rota mutável de `/api/admin/**`.
7. `src/proxy.ts` (Next 16): para `pathname` que começa com `/admin` **e não** começa com `/admin/esqueci-senha`, `/admin/redefinir`, `/admin/convite` nem é exatamente `/admin`, se não houver cookie `bj_admin`, `NextResponse.redirect(new URL('/admin?next=' + pathname, req.url))`. `config.matcher = ['/admin/:path*']`. Sem acesso a banco aqui.
8. Rotas:
   - `POST /api/admin/auth/login` `{ email, password, remember }`: `assertSameOrigin`; rate limit 5/15 min por IP **e** por e-mail; buscar `AdminUser` por e-mail normalizado; se não existir, rodar `verifyPassword` contra um hash fixo (evitar timing); se inválido → 401 `{ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' }`; se `!active` → 403; sucesso → `createSession` + cookie + `audit('auth.login')` → `{ admin }` (inclui `mustChangePassword`).
   - `POST /api/admin/auth/trocar-senha` `{ currentPassword, newPassword }`: `requireAdmin({ allowPasswordChangePending: true })`; verifica a atual; aplica política; grava novo hash, `mustChangePassword = false`; apaga as outras sessões; `audit('auth.password_changed')`.
   - `POST /api/admin/auth/logout`: `destroySession` → `{ ok: true }`.
   - `GET /api/admin/auth/me`: `{ admin }` ou 401.
9. `scripts/admin-create.ts` (rodar com `tsx`): lê `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_PASSWORD` do ambiente (aceita também `--email`, `--name`, `--role OWNER|ADMIN`, padrão OWNER). Se faltar senha, perguntar no terminal sem eco. Validar política, `upsert` por e-mail (não sobrescrever senha de admin que já tem `acceptedAt` sem `--force`), `acceptedAt = now`, **`mustChangePassword = true`** quando a senha veio do ambiente ou de argumento. Script `"admin:create": "tsx scripts/admin-create.ts"`. Nunca imprimir a senha.
10. Testes unitários: hash/verify; política rejeita 9 caracteres e senha sem número. Integração: criar admin via função do script (exportar `createAdmin()`), login OK devolve cookie `bj_admin` HttpOnly e `mustChangePassword: true`; `GET /api/admin/metricas`-equivalente (usar `requireAdmin` direto) lança `PASSWORD_CHANGE_REQUIRED`; `trocar-senha` libera; senha errada 401; 6ª tentativa 429; `me` com cookie 200 e sem cookie 401; logout invalida; sessão com `remember` tem `expiresAt` ~30 dias.

## Critério de aceite
```
test -f src/proxy.ts && test ! -f src/middleware.ts && echo proxy-ok
docker compose -f docker-compose.test.yml up -d && npm run test:integration
npm run typecheck && npm run lint && npm test && npm run build
npm run admin:create   # com ADMIN_BOOTSTRAP_* do .env; deve criar o OWNER e sair sem imprimir a senha
```

## Não fazer
- Não guardar o token de sessão em claro no banco.
- Não revelar se o e-mail existe nas mensagens de erro.
- Não usar `middleware.ts`.
- Não validar sessão no proxy consultando o banco.
- Não imprimir nem logar senhas, nem as de bootstrap.

## Desvios registrados
- (2026-10-09) Schema real de `Session`/`AdminUser`, respostas de erro e rate limit provisórios, e a senha de bootstrap fora da política (OWNER ainda não criado no banco de dev): ver [[decisoes/010-contratos-reais-da-janela-b]].
