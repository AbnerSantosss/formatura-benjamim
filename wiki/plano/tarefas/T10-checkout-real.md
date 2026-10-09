---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-3, checkout, design-intocavel]
---

# T10 — Checkout chamando a API

- **Modelo:** opus.
- **Depende de:** T08.
- **Arquivos:** `src/components/checkout.tsx`, `src/components/number-picker.tsx` (só origem dos ocupados), `src/components/checkout-entry.tsx`, `src/lib/api-client.ts` (criar), `src/app/contribuir/page.tsx`.
- **Ler antes:** [[fluxos/compra-de-numeros]], contratos em [[plano/tarefas/T08-rotas-api-publicas]].

> **Regra do dono (2026-10-09): o design do checkout é intocável.** Grade de números, cards de valor, formulário, botões, cores, espaçamentos e `order-flow.css` ficam exatamente como estão. Só muda de onde vêm os dados e para onde vai o envio. Mensagens de erro novas usam o **mesmo elemento e classe** onde hoje aparecem erros de validação. Comparar com `revisao/baseline/` antes de entregar.

## Passos
1. Criar `src/lib/api-client.ts` (client-safe): `fetchOccupied(): Promise<number[]>`, `createOrder(input): Promise<CreatedOrderResponse>` que lança `ApiError { status, code, message, details, numbers? }` quando `!res.ok`.
2. Em `checkout.tsx`:
   - remover todo uso de `demo-store` (`grep -n "demo-store" src/components/checkout.tsx`);
   - carregar ocupados com `fetchOccupied()` no mount e a cada 20 s (`setInterval`, limpar no unmount);
   - gerar `idempotencyKey` com `crypto.randomUUID()` uma vez por montagem do formulário (`useRef`); trocar por outra só depois de um pedido criado com sucesso;
   - no submit: validar no cliente com `contributorSchema`/`newOrderSchema` de `@/domain/validation` (mesmas mensagens), chamar `createOrder`, e em sucesso `router.push(`/pagamento/${orderId}?t=${publicToken}`)`;
   - em erro 409: recarregar ocupados, desmarcar os números devolvidos em `numbers`, mostrar "Os números X, Y acabaram de ser reservados por outra pessoa. Escolha outros." no mesmo lugar dos erros de validação;
   - em 503 `GATEWAY_NOT_CONFIGURED`: mostrar "Pagamentos em configuração. Tente de novo em instantes." e desabilitar o botão por 30 s;
   - em 429: "Muitas tentativas. Aguarde um minuto.";
   - remover o botão/atalho "preencher dados de teste" e qualquer dado fictício. Se esse botão ocupa espaço no layout, remover **só o botão**, sem reorganizar o resto.
3. `number-picker.tsx`: receber `occupied: Set<number>` por prop (já deve receber); não ler storage.
4. `checkout-entry.tsx` e `contribuir/page.tsx`: continuar lendo `?valor=`, `?modalidade=` e aceitar `?numeros=1,2,3` (pré-seleção usada pelo "Gerar novo Pix" da T11). `searchParams` é **assíncrono** no Next 16 (`const sp = await searchParams`) se for Server Component.
5. Manter o rascunho em `sessionStorage` (nome/e-mail/WhatsApp) se já existir; nunca guardar CPF.
6. Capturas de `/contribuir?valor=5` desktop e mobile comparadas com a baseline.

## Critério de aceite
```
grep -rn "demo-store\|dados de teste" src/components/checkout.tsx src/components/checkout-entry.tsx ; echo "(esperado: nada)"
git diff --stat -- src/app/order-flow.css src/app/globals.css src/app/reference.css ; echo "(esperado: nenhum CSS alterado)"
npm run typecheck && npm run lint && npm test && npm run build
```
Teste manual com `DEMO_MODE=true`: escolher 10 números, enviar, cair em `/pagamento/<id>?t=...`.

## Não fazer
- Não alterar CSS, classes, estrutura JSX, textos ou imagens.
- Não confirmar pagamento no cliente.

## Desvios registrados
- (2026-10-09) Arquivo a mais: `src/lib/api-client.ts` (`fetchOccupied`, `createOrder`, `fetchOrderStatus`, `approveDemoOrder`, `ApiError`), usado também pelas telas de pagamento.
- (2026-10-09) Sem o botão "Preencher dados de teste" a página fica 61 px mais curta que a baseline; nada mais foi reorganizado.
- (2026-10-09) Título e id do produto no resumo ainda vêm de `productFor` em `src/lib/demo-model.ts`; os textos de demonstração do checkout ("Pix · demonstração", "Total simulado" etc.) ficaram como estavam e aguardam decisão do dono.
- (2026-10-09) `/contribuir` repassa a `Progress` e `Footer` os dados do banco (ADR 011).
