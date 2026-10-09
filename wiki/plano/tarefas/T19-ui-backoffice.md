---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-5, ui, backoffice]
---

# T19 — Backoffice ligado à API

- **Modelo:** opus.
- **Depende de:** T17, T18.
- **Arquivos:** `src/components/backoffice.tsx` (reescrever a fonte de dados, manter visual), (criar) `src/components/admin/orders-table.tsx`, `products-panel.tsx`, `users-panel.tsx`, `settings-panel.tsx`, `confirm-dialog.tsx`, `draw-card.tsx` (placeholder), `src/lib/admin-client.ts`; (remover depois) qualquer import de `demo-store` no backoffice.
- **Ler antes:** [[fluxos/backoffice]], contratos da [[plano/tarefas/T18-api-admin]].

> O backoffice pode ganhar seções novas (produtos, usuários, configurações, sorteio) porque o dono pediu essas funções. Mesmo assim, reutilizar as classes e o estilo que já existem. **As páginas públicas (landing, checkout, obrigado) não são tocadas por esta tarefa.**

## Passos
1. `src/lib/admin-client.ts`: funções `fetch` tipadas para cada rota da T18, com `credentials: 'same-origin'` e tratamento de 401 (`window.location.assign('/admin')`) e 403 `PASSWORD_CHANGE_REQUIRED` (`/admin/trocar-senha`).
2. `backoffice.tsx`: manter sidebar, topbar, cards de métricas e tabela **como estão visualmente**. Trocar o estado do `demo-store` por `useEffect` + `admin-client` com estados `loading/error/data`. Atualização automática das métricas a cada 30 s.
3. Seções, cada uma em seu componente (classes CSS existentes):
   - **Visão geral**: métricas + card "Sorteio" com `drawAt` formatado em `America/Fortaleza`, contagem regressiva, e `<DrawCard />` **placeholder** que apenas mostra a data e o texto "Sorteio disponível na data configurada" (a T20 substitui pelo real).
   - **Pedidos** (`orders-table.tsx`): busca com debounce 300 ms, filtros, paginação, ações Abrir / Estornar / Reenviar e-mail, botão Exportar CSV (link direto). Estornar abre `confirm-dialog.tsx` (modal próprio, acessível, foco preso, Esc fecha) e só então chama a API.
   - **Produtos**: cards editáveis (título, descrição, ativo) com salvar.
   - **Usuários**: tabela + formulário "Convidar" (nome, e-mail, papel) + ações Reenviar convite / Desativar (com confirmação). Mostrar o papel do usuário logado; esconder ações que o papel não permite.
   - **Configurações**: formulário com meta, custos, data/hora do sorteio (`<input type="datetime-local">` convertido de/para ISO considerando o fuso `America/Fortaleza`), exibir resultado na landing, Instagram, mensagem pública; card "Gateways" lendo `gateways` do `GET configuracoes`; botão "Rodar expiração agora".
4. Em `isDemo`, mostrar na tabela um botão "Aprovar (demo)" por pedido PENDING chamando `POST /api/demo/aprovar`. Fora de demo, não renderizar. (Expor `isDemo` ao cliente via prop do Server Component `admin/page.tsx`.)
5. Remover "Aprovar teste", "Limpar dados de teste", chip "MODO DEMONSTRAÇÃO" e qualquer referência a `demo-store`.

## Critério de aceite
```
grep -rn "demo-store\|Limpar dados de teste\|MODO DEMONSTRAÇÃO" src/components/backoffice.tsx src/components/admin ; echo "(esperado: nada)"
git diff --stat -- src/app/reference.css src/app/order-flow.css src/app/obrigado/thanks.css src/app/pagamento/payment-viewport.css ; echo "(esperado: nenhum CSS público alterado)"
npm run typecheck && npm run lint && npm test && npm run build
```
Manual: login → métricas carregam → filtrar pedidos → estornar um pedido aprovado (demo) → convidar usuário → salvar data do sorteio.

## Não fazer
- Não alterar CSS das páginas públicas. Novas regras só para modal e formulários do painel, no arquivo CSS já usado pelo backoffice.
- Não usar `window.confirm`/`alert`/`prompt`.
