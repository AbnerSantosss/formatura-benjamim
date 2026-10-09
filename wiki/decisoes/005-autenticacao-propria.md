---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, auth, seguranca]
---

# ADR 005 — Autenticação própria (sem Auth.js/Clerk)

**Status:** aceita em 2026-10-09.

## Contexto
Precisamos de: login por e-mail e senha, "lembrar de mim", "esqueci minha senha", convite por e-mail para novos admins definirem senha. São poucos usuários (família), sem login social.

## Opções
- **Auth.js (NextAuth) v5**: bom para OAuth, mas credenciais + convite + reset exigem adaptador e callbacks; a versão 5 ainda tem arestas com Next 16 e o fluxo de convite não existe pronto.
- **Clerk/Supabase Auth**: serviço externo, custo e dependência para 2 ou 3 usuários.
- **Própria**: ~400 linhas, totalmente sob controle, sem dependência externa; padrão conhecido (hash bcrypt, sessão opaca em banco, tokens de uso único com hash).

## Decisão
Autenticação própria conforme [[fluxos/autenticacao-admin]]:
- `bcryptjs` custo 12 (puro JS, sem build nativo no Docker).
- Sessões opacas: token aleatório de 32 bytes no cookie, `sha256` no banco. Revogável, com `remember` controlando a validade (12 h ou 30 dias).
- Tokens de convite e redefinição: 32 bytes aleatórios, só o hash gravado, `expiresAt`, `usedAt`, um ativo por usuário e tipo.
- `src/proxy.ts` só redireciona ausência de cookie; `requireAdmin()` valida no banco.
- Rate limit simples em memória por processo (um único container). Se escalar para mais de um processo, trocar por tabela.
- CSRF: rotas mutáveis exigem `Origin`/`Referer` igual a `NEXT_PUBLIC_SITE_URL` + cookie `SameSite=Lax`. Suficiente para o painel.

## Consequências
- Nenhuma dependência de auth externa. Código revisado pela tarefa de segurança ([[plano/tarefas/T22-seguranca]]).
- Sem 2FA no escopo inicial; pode ser adicionado (TOTP) depois sem mudar o modelo.
