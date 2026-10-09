---
tipo: decisao
atualizado: 2026-10-09
tags: [decisao, landing, checkout, design-intocavel]
---

# 011 — `Progress` e `Footer` recebem os dados por prop

## Contexto
A [[plano/tarefas/T09-landing-com-banco]] manda tirar de `src/lib/campaign.ts` os valores que passam a vir do banco (`raised`, `goal`, Instagram). Esses campos são lidos por `Progress` e `Footer` em `src/components/shared.tsx`, arquivo que não está na lista da T09 e que também serve `/contribuir` e as páginas legais. O subagente da T09 parou no passo 1 e devolveu a decisão ao orquestrador.

## Decisão
Tomada pelo orquestrador (não envolve dinheiro, dados pessoais nem mudança visual):

1. `src/components/shared.tsx` entra na lista da T09, só para trocar a origem dos dados. JSX, classes, textos e ordem ficam iguais.
2. `Progress` passa a receber `raisedCents` e `goalCents` (obrigatórios) e `winner` (opcional, `{ number, firstName } | null`). A linha "Número sorteado: NNNN — parabéns, <firstName>!" só aparece com `winner` preenchido, dentro do card.
3. `Footer` passa a receber `instagramFather` e `instagramMother` (opcionais, texto). Sem valor, o link não aparece, como já era.
4. Cada página de servidor lê o que precisa direto do serviço e do banco e repassa: `/` na T09; `/contribuir` na T10 (o arquivo `src/app/contribuir/page.tsx` já é dela); páginas legais na T13.
5. `src/lib/campaign.ts` fica só com o que é estático (`amounts`, `defaultAmount`, `money`, `resolveAmount`).

## Consequências
- Entre a entrega da T09 e a da T10 o `typecheck` pode acusar `/contribuir` sem as props novas; o orquestrador valida as duas juntas.
- O Instagram ainda não tem função de leitura no serviço: cada página lê os dois campos da campanha `main`. A T22 pode unificar.
