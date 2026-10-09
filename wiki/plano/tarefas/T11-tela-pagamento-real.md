---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-3, pagamento, pix, design-intocavel]
---

# T11 — Tela `/pagamento/[id]` com Pix real

- **Modelo:** opus.
- **Depende de:** T08.
- **Arquivos:** (criar) `src/app/pagamento/[id]/page.tsx`, `src/components/payment-status-poller.tsx`; (alterar) `src/components/payment-frame.tsx`, `src/components/order-details.tsx`; (remover) `src/app/pagamento/page.tsx`, `src/components/demo-payment.tsx` (depois de migrar o JSX).
- **Ler antes:** [[fluxos/pagamento-pix]] seção "Tela", docs do Next 16 em `node_modules/next/dist/docs/` sobre `params`/`searchParams` assíncronos, `src/components/demo-payment.tsx` (o visual a preservar).

> **Regra do dono: o design da tela de pagamento é intocável** (mesma regra do checkout). O JSX de `demo-payment.tsx` é movido **inteiro**, só trocando a origem dos dados. `payment-viewport.css` e `order-flow.css` não mudam. Os botões de simulação já existem no layout de demo; em produção eles simplesmente não são renderizados.

## Passos
1. Criar `src/app/pagamento/[id]/page.tsx` (Server Component):
   ```ts
   export const dynamic = 'force-dynamic';
   export default async function Page({ params, searchParams }) {
     const { id } = await params; const { t } = await searchParams;
     const order = await getOrderPublic(id, typeof t === 'string' ? t : '');
     if (!order) notFound();
     return <PaymentFrame order={order} demo={isDemo} />;
   }
   ```
2. Mover o JSX de `demo-payment.tsx` para `payment-frame.tsx` trocando dados do storage por `order` (prop). QR: `<img alt="QR Code Pix" src={`data:image/png;base64,${order.payment.qrCodeBase64}`} />` no mesmo elemento onde hoje está o QR falso. Copia e cola: `order.payment.qrCode` com o botão copiar já existente (`navigator.clipboard.writeText`, fallback `select()` + `document.execCommand('copy')`). Se `ticketUrl`, o link "Abrir no Mercado Pago" ocupa o lugar do link equivalente de demo, se houver; se não houver, não criar elemento novo.
3. `payment-status-poller.tsx` (Client, sem UI própria): `useEffect` com `setInterval` 5 s chamando `GET /api/pedidos/${id}/status?t=${t}`; ao receber `APPROVED`, `router.replace(`/obrigado/${id}?t=${t}`)`; ao receber `EXPIRED`/`CANCELED`, acionar o estado "expirado" que o layout de demo já tem (bloco "Pix expirado" com botão **Gerar novo Pix** → `/contribuir?valor=<amount>&numeros=<lista>`). Parar o polling quando a aba está oculta (`document.visibilityState`).
4. Cronômetro: contar a partir de `order.expiresAt` (servidor), não de `Date.now()` do cliente na montagem.
5. Botões de simulação: renderizar **somente** se `demo === true` (prop vinda do servidor), com rótulo "Simular aprovação (demo)" chamando `POST /api/demo/aprovar`.
6. Apagar `src/app/pagamento/page.tsx` e `src/components/demo-payment.tsx`. Atualizar imports.
7. `generateMetadata` com `robots: { index: false }`.
8. Capturas desktop e mobile comparadas com a baseline de `/pagamento`.

## Critério de aceite
```
test ! -f src/app/pagamento/page.tsx && test ! -f src/components/demo-payment.tsx && echo removidos
git diff --stat -- src/app/pagamento/payment-viewport.css src/app/order-flow.css ; echo "(esperado: nenhum CSS alterado)"
npm run typecheck && npm run lint && npm test && npm run build
```
Teste manual em `DEMO_MODE=true`: criar pedido, ver QR, clicar "Simular aprovação (demo)", ser levado a `/obrigado/<id>?t=...`.

## Não fazer
- Não mostrar os botões de demo quando `demo` for falso.
- Não ler `localStorage`/`sessionStorage` para dados do pedido.
- Não alterar CSS, classes, estrutura ou textos.
