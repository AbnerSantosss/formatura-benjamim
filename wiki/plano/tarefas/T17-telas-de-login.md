---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-4, ui, login]
---

# T17 — Telas de login, esqueci senha, redefinir, convite e troca obrigatória de senha

- **Modelo:** opus.
- **Depende de:** T16.
- **Arquivos:** (criar) `src/components/admin/login-form.tsx`, `src/components/admin/password-form.tsx`, `src/app/admin/esqueci-senha/page.tsx`, `src/app/admin/redefinir/[token]/page.tsx`, `src/app/admin/convite/[token]/page.tsx`, `src/app/admin/trocar-senha/page.tsx`, `src/components/admin/admin-shell.tsx`; (alterar) `src/app/admin/page.tsx`, `src/components/backoffice.tsx` (só extrair o bloco de login).
- **Ler antes:** [[fluxos/autenticacao-admin]] seção "Telas", `src/components/backoffice.tsx` (o bloco de login atual é o visual a manter).

## Passos
1. Extrair de `backoffice.tsx` o JSX da tela de login (coluna de história + card) para `login-form.tsx` (Client). Campos: e-mail (`type=email`, `autoComplete=email`), senha (`autoComplete=current-password`), checkbox **Lembrar de mim**, link **Esqueci minha senha** → `/admin/esqueci-senha`. Remover o texto de credenciais de demonstração. Submit → `POST /api/admin/auth/login`; erro → mensagem inline; sucesso → se `admin.mustChangePassword`, `router.replace('/admin/trocar-senha')`; senão `router.replace(searchParams.next ?? '/admin')`; sempre `router.refresh()`.
2. `src/app/admin/page.tsx` vira Server Component: `const auth = await getAdminOrNull(); if (!auth) return <LoginForm />; if (auth.admin.mustChangePassword) redirect('/admin/trocar-senha'); return <AdminShell admin={auth.admin}><Backoffice /></AdminShell>;` (`Backoffice` ainda usa dados antigos até a T19; não quebrar o build).
3. `password-form.tsx` (Client): props `{ mode: 'reset' | 'invite' | 'change', token?, name? }`; campos nome (só invite), senha atual (só change), nova senha, confirmação, com validação da política e mensagem de força mínima; submit para a rota correspondente (`redefinir`, `aceitar-convite`, `trocar-senha`); sucesso → `/admin` (invite e change já estão logados) ou "Senha redefinida. Entre com a nova senha." com link.
4. `trocar-senha/page.tsx`: Server Component; exige sessão (`getAdminOrNull`, senão redirect `/admin`); mostra o `password-form` em modo `change` com o texto "Sua senha é temporária. Defina uma nova para continuar." Usa o mesmo card visual do login.
5. Páginas `redefinir/[token]` e `convite/[token]`: Server Component com `const { token } = await params`; chamar `peekToken` direto do servidor (não via HTTP); inválido → tela "Link inválido ou expirado" com botão para `/admin/esqueci-senha` (reset) ou texto "Peça um novo convite ao administrador" (invite).
6. `esqueci-senha/page.tsx`: formulário com e-mail; sempre mostra "Se este e-mail estiver cadastrado, enviamos um link. Verifique também o spam."
7. `admin-shell.tsx`: sidebar/topbar atuais com nome do admin, papel e botão **Sair** (`POST logout` + `router.refresh()`).
8. Reutilizar as classes CSS existentes do login/backoffice. Novas regras só se indispensáveis, no mesmo arquivo CSS do backoffice. **Não tocar** nos CSS das páginas públicas.

## Critério de aceite
```
grep -rn "benjamim123\|credenciais de demonstração" src/ ; echo "(esperado: nada)"
npm run typecheck && npm run lint && npm test && npm run build
```
Manual: `npm run admin:create` → login com o admin do `.env` → cai em "trocar senha" → define nova → entra no painel; sair volta ao login; link de convite do Mailpit abre a tela de definir senha.

## Não fazer
- Não alterar o visual do card de login além dos campos pedidos.
- Não usar `window.confirm`/`alert`.
- Não deixar o painel acessível enquanto `mustChangePassword` for verdadeiro.
