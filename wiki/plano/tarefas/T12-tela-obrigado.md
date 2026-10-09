---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-3, obrigado, design-intocavel]
---

# T12 — Tela `/obrigado/[id]` validada no servidor

- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** T08.
- **Arquivos:** (criar) `src/app/obrigado/[id]/page.tsx`; (renomear) `src/components/demo-thanks.tsx` → `src/components/thanks-view.tsx`; (remover) `src/app/obrigado/page.tsx`.
- **Ler antes:** `src/components/demo-thanks.tsx`, `src/app/obrigado/thanks.css` (não alterar).

> **Regra do dono: o design da página de obrigado é intocável.** `thanks.css`, as imagens de `public/images/` e o JSX ficam iguais; só muda a origem dos dados (do storage para a prop `order`).

## Passos
1. `git mv src/components/demo-thanks.tsx src/components/thanks-view.tsx`; renomear o componente para `ThanksView` e trocar os dados vindos de storage por uma prop `order` com `{ id, status, amountCents, numbers: number[], product: { title, mode }, contributorFirstName, drawAt }`.
2. Criar `src/app/obrigado/[id]/page.tsx` (Server Component, `dynamic = 'force-dynamic'`): `const { id } = await params; const { t } = await searchParams;` → `getOrderPublic(id, t)`; se `null`, `notFound()`; se `status !== 'APPROVED'`, `redirect(`/pagamento/${id}?t=${t}`)`; senão `<ThanksView order={...} />`. Passar só o primeiro nome do contribuidor.
3. Apagar `src/app/obrigado/page.tsx`. Corrigir qualquer import de `demo-thanks`.
4. `generateMetadata`: `robots: { index: false }`, título "Obrigado! · Benjamim".
5. Capturas desktop e mobile comparadas com a baseline de `/obrigado`.

## Critério de aceite
```
test ! -f src/app/obrigado/page.tsx && test ! -f src/components/demo-thanks.tsx && echo ok
grep -rn "demo-thanks" src/ ; echo "(esperado: nada)"
git diff --stat -- src/app/obrigado/thanks.css ; echo "(esperado: nenhum CSS alterado)"
npm run typecheck && npm run lint && npm test && npm run build
```

## Não fazer
- Não alterar `thanks.css`, as imagens, as classes nem os textos.
- Não mostrar a tela para pedido que não esteja APPROVED.

## Desvios registrados
- (2026-10-09) `demo-thanks.tsx` virou `src/components/thanks-view.tsx` (componente de servidor, com os detalhes do pedido embutidos); removido `src/app/obrigado/page.tsx`.
- (2026-10-09) Os textos de demonstração ("Pedido na demonstração", "Aprovação simulada", "Este é um teste. Nenhum dinheiro foi movimentado.") foram mantidos; a versão de produção aguarda decisão do dono.
- (2026-10-09) Pedido não aprovado redireciona para `/pagamento/<id>?t=`.
