---
tipo: fluxo
atualizado: 2026-10-09
tags: [auth, login, senha, convite, sessao]
---

# Fluxo: autenticação do admin

## Telas
- `/admin` — se sem sessão, mostra o login (mesmo visual atual: coluna de história à esquerda, card à direita). Campos: **e-mail**, **senha**, checkbox **Lembrar de mim**, link **Esqueci minha senha**. Sem credenciais de demonstração na tela.
- `/admin/esqueci-senha` — campo e-mail → sempre responde "Se este e-mail estiver cadastrado, enviamos um link" (não revela se existe).
- `/admin/redefinir/[token]` — nova senha + confirmação. Token expira em 1 h, uso único.
- `/admin/convite/[token]` — nome (pré-preenchido), definir senha + confirmação. Token expira em 7 dias, uso único. Ao concluir, loga e vai para `/admin`.
- `/admin/trocar-senha` — senha atual + nova + confirmação. Obrigatória quando `AdminUser.mustChangePassword = true` (admin inicial criado por script ou senha redefinida pelo OWNER); enquanto a flag estiver ligada, qualquer rota `/admin/**` redireciona para cá.

## Regras
- Senha: mínimo 10 caracteres. Hash com `bcryptjs` custo 12.
- Sessão: valor aleatório de 32 bytes em cookie `bj_admin` (HttpOnly, Secure em produção, SameSite=Lax, Path=/). No banco, `Session.tokenHash = sha256(valor)`.
  - Sem "lembrar": expira em 12 h.
  - Com "lembrar": expira em 30 dias (`remember = true`).
- Logout apaga a `Session` e o cookie.
- `src/proxy.ts` redireciona `/admin/**` sem cookie para `/admin` (login), exceto as rotas públicas acima. A validação de verdade (cookie ↔ banco) é feita em `requireAdmin()` nas rotas e nos Server Components, porque o proxy não deve acessar o banco.
- Rate limit: 5 tentativas por 15 min por IP e por e-mail (tabela em memória por processo é aceitável; se quiser durável, tabela `RateLimit`).
- Primeiro admin: script `npm run admin:create` lê `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_NAME` e `ADMIN_BOOTSTRAP_PASSWORD` do `.env` ([[operacao/variaveis-de-ambiente]]). Cria com papel OWNER e `mustChangePassword = true`; a senha do `.env` é temporária e nunca é impressa.
- Troca obrigatória: `POST /api/admin/auth/trocar-senha` valida a senha atual, grava o novo hash, zera `mustChangePassword` e revoga as outras sessões do usuário.

## Convite de novos admins
1. Admin logado → Usuários → "Convidar" (nome, e-mail).
2. `POST /api/admin/usuarios` cria `AdminUser` com `passwordHash = null`, `invitedAt`, `invitedById`; cria `AuthToken(kind=INVITE)`.
3. Envia o e-mail de convite ([[integracoes/email]] template `convite`) com o link `${NEXT_PUBLIC_SITE_URL}/admin/convite/<token>`.
4. Convidado abre o link, define senha → `POST /api/admin/auth/aceitar-convite` → `acceptedAt`, sessão criada.
5. Reenviar convite gera token novo e invalida o anterior.

Tarefas: [[plano/tarefas/T14-auth-base]], [[plano/tarefas/T16-fluxos-de-senha-e-convite]], [[plano/tarefas/T17-telas-de-login]].
