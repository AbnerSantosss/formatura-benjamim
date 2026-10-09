---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-4, auth, convite, senha]
---

# T16 — Esqueci senha, redefinir senha e convite de admins (API)

- **Modelo:** opus.
- **Depende de:** T14, T15.
- **Arquivos (criar):** `src/server/auth/tokens.ts`, `src/server/auth/invites.ts`, `src/app/api/admin/auth/esqueci-senha/route.ts`, `src/app/api/admin/auth/redefinir/route.ts`, `src/app/api/admin/auth/token/[token]/route.ts`, `src/app/api/admin/auth/aceitar-convite/route.ts`, `tests/integration/auth-flows.test.ts`.
- **Ler antes:** [[fluxos/autenticacao-admin]], [[integracoes/email]].

## Passos
1. `tokens.ts`: `issueToken(adminId, kind: 'INVITE' | 'RESET', ttlMs)` → invalida tokens anteriores do mesmo `adminId`+`kind` (`usedAt = now`), grava `AuthToken { tokenHash, kind, expiresAt }`, devolve `raw`. `consumeToken(raw, kind)` → busca por hash, exige `usedAt == null && expiresAt > now`, marca `usedAt`, devolve `adminId`; senão lança `AppError('TOKEN_INVALID', 400, 'Link inválido ou expirado.')`. `peekToken(raw, kind)` igual, sem consumir (para a página renderizar).
2. `invites.ts`: `inviteAdmin({ name, email, role }, invitedBy)` → `upsert` do `AdminUser` (se já existir **ativo com senha**, lança 409 "Já é administrador"); `issueToken(INVITE, 7 dias)`; `sendEmail('convite-admin', email, { nome, convidadoPor: invitedBy.name, url: `${env.NEXT_PUBLIC_SITE_URL}/admin/convite/${raw}` })`; `audit('admin.invited')`. `resendInvite(adminId, by)` reemite.
3. Rotas (todas com `assertSameOrigin` e rate limit 5/15 min por IP):
   - `POST esqueci-senha` `{ email }`: se existir admin ativo com senha, `issueToken(RESET, 1 h)` + `sendEmail('redefinir-senha')`. **Sempre** responde 200 `{ ok: true }` em tempo parecido (fazer o hash fictício no caminho "não existe").
   - `POST redefinir` `{ token, password }`: política de senha; `consumeToken(RESET)`; `passwordHash` novo; `mustChangePassword = false`; apagar **todas** as `Session` do admin; `audit('auth.password_reset')`; 200.
   - `GET token/[token]?kind=INVITE|RESET`: `const { token } = await params`; `peekToken`; devolve `{ valid: true, name, email }` ou `{ valid: false }` (nunca 500).
   - `POST aceitar-convite` `{ token, name, password }`: `consumeToken(INVITE)`; grava `name`, `passwordHash`, `acceptedAt`, `mustChangePassword = false`; `createSession(remember=false)` + cookie; `audit('admin.invite_accepted')`; 200 `{ admin }`.
4. Testes de integração com transport `jsonTransport` (capturar o `raw` do token lendo o link do e-mail no JSON): convite → aceitar → sessão válida; aceitar duas vezes falha; token expirado falha; esqueci-senha para e-mail inexistente responde 200 sem enviar; redefinir derruba sessões antigas.

## Critério de aceite
```
docker compose -f docker-compose.test.yml up -d && npm run test:integration
npm run typecheck && npm run lint && npm test && npm run build
```

## Não fazer
- Não devolver o token nas respostas das rotas (só por e-mail).
- Não revelar existência de e-mail.
- Não aceitar convite para admin desativado (`active = false` → 403).
