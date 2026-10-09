---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-3, landing, design-intocavel]
---

# T09 — Landing lendo do banco

- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** T08.
- **Arquivos:** `src/app/page.tsx`, `src/lib/campaign.ts`, `src/components/reference-landing.tsx` (só props/dados), `src/app/layout.tsx` (só metadata/robots).
- **Ler antes:** [[fluxos/sorteio]] (exibição pública), `src/components/reference-landing.tsx`.

> **Regra do dono (2026-10-09): o design da página principal é intocável.** Nenhuma classe CSS, imagem, ordem de seções, espaçamento ou texto visível muda. Esta tarefa só troca a **origem dos números** (valor arrecadado, meta, números vendidos, data do sorteio). Antes de entregar, compare visualmente com `revisao/baseline/` (T00).

## Passos
1. Em `src/lib/campaign.ts`, remover o campo `raised` fixo e qualquer valor que agora vem do banco (meta, Instagram). Manter textos estáticos (história, FAQ, prêmios).
2. `src/app/page.tsx` vira `async function Page()`: `export const revalidate = 30;` chama `getCampaignSummary(new Date())` **direto do serviço** (não via HTTP) e passa para `<ReferenceLanding summary={...} />`.
3. Em `reference-landing.tsx`: aceitar `summary` como prop e usar `raisedCents`, `goalCents`, `numbersSold`, `numbersAvailable`, `drawAt`, `drawPublic`, `winner`. Manter todo o JSX/CSS; só trocar a origem dos valores. Se `drawPublic && winner`, mostrar uma única linha "Número sorteado: NNNN — parabéns, <firstName>!" **dentro do card de progresso já existente**, usando a mesma classe de texto secundário desse card. Nada novo fora disso.
4. `layout.tsx`: `robots: { index: process.env.NODE_ENV === 'production', follow: true }`. Não mexer no banner nesta tarefa (T13 faz).
5. Verificar `npm run build` sem erro de "Dynamic server usage"; se ocorrer, consultar em `node_modules/next/dist/docs/` as páginas sobre `revalidate` e `use cache` e ajustar só a leitura de dados.
6. Tirar capturas de `/` (desktop 1280 e mobile 390) e comparar lado a lado com `revisao/baseline/`. Diferença permitida: apenas os números exibidos.

## Critério de aceite
```
npm run typecheck && npm run lint && npm test && npm run build
grep -n "raised" src/lib/campaign.ts ; echo "(esperado: nada)"
git diff --stat -- src/app/*.css src/app/**/*.css ; echo "(esperado: nenhum CSS alterado)"
```
Abrir `/` com o banco com 1 pedido aprovado (criar via demo) e ver o valor arrecadado.

## Não fazer
- Não reescrever o CSS, o JSX estrutural, as imagens ou os textos.
- Não buscar dados via `fetch('http://localhost...')` dentro do Server Component.

## Desvios registrados
- (2026-10-09) `src/components/shared.tsx` entrou na tarefa só para trocar a origem dos dados: `Progress` recebe `raisedCents`, `goalCents` e `winner`; `Footer` recebe `instagramFather` e `instagramMother` ([[decisoes/011-progress-e-footer-recebem-dados-por-prop]]).
- (2026-10-09) O Instagram é lido direto da campanha `main` em `src/app/page.tsx` (não há função no serviço).
- (2026-10-09) `robots.index` em `layout.tsx` passou a depender de `NODE_ENV === 'production'`.
