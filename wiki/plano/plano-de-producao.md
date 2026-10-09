---
tipo: plano
atualizado: 2026-10-09
tags: [plano, producao, fases, agentes]
---

# Plano de produção

Objetivo: transformar o protótipo (tudo em localStorage) em sistema de produção com banco, Mercado Pago, painel autenticado multiusuário, e-mails e sorteio. Visual existente é mantido. Executado pelo [[plano/orquestrador]] com uma tarefa por arquivo em `wiki/plano/tarefas/`.

## Como ler
- Cada tarefa tem **Modelo**, **Depende de**, **Arquivos**, **Passos** literais, **Critério de aceite** (comandos) e **Não fazer**.
- Tarefas sem dependência entre si rodam em paralelo. Nunca duas tarefas tocando o mesmo arquivo ao mesmo tempo.
- Nada avança para a fase seguinte sem `npm run typecheck && npm run lint && npm test` verdes.

## Fases e tarefas
| Fase | Tarefa | Modelo | Depende de | Paralelo com |
|---|---|---|---|---|
| 0 Base | [[plano/tarefas/T00-preparacao]] | orquestrador | — | — |
| 0 Base | [[plano/tarefas/T01-remover-export-estatico]] | haiku | T00 | T02, T03, T04 |
| 0 Base | [[plano/tarefas/T02-docker]] | haiku | T00 | T01, T03, T04 |
| 0 Base | [[plano/tarefas/T03-prisma-schema]] | opus | T00 | T01, T02, T04 |
| 0 Base | [[plano/tarefas/T04-env]] | opus | T00 | T01, T02, T03 |
| 1 Domínio | [[plano/tarefas/T05-dominio-puro]] | opus | T00 | T01–T04 |
| 1 Domínio | [[plano/tarefas/T06-servico-de-pedidos]] | opus | T03, T04, T05 | T07 |
| 1 Domínio | [[plano/tarefas/T07-gateways]] | opus | T03, T04 | T06 |
| 2 API pública | [[plano/tarefas/T08-rotas-api-publicas]] | opus | T01, T06, T07 | T15 |
| 3 Front público | [[plano/tarefas/T09-landing-com-banco]] | haiku | T08 | T10, T11, T12, T13 |
| 3 Front público | [[plano/tarefas/T10-checkout-real]] | opus | T08 | T09, T11, T12, T13 |
| 3 Front público | [[plano/tarefas/T11-tela-pagamento-real]] | opus | T08 | T09, T10, T12, T13 |
| 3 Front público | [[plano/tarefas/T12-tela-obrigado]] | haiku | T08 | T09, T10, T11, T13 |
| 3 Front público | [[plano/tarefas/T13-textos-e-copy]] | haiku | T01 | T09–T12 |
| 4 Auth | [[plano/tarefas/T14-auth-base]] | opus | T03, T04 | T15 |
| 4 Auth | [[plano/tarefas/T15-email]] | haiku (15a templates) + opus (15b transporte) | T04 | T14 |
| 4 Auth | [[plano/tarefas/T16-fluxos-de-senha-e-convite]] | opus | T14, T15 | T18 |
| 4 Auth | [[plano/tarefas/T17-telas-de-login]] | opus | T16 | T18 |
| 5 Admin | [[plano/tarefas/T18-api-admin]] | opus | T06, T07, T14, T15 | T16, T17 |
| 5 Admin | [[plano/tarefas/T19-ui-backoffice]] | opus | T17, T18 | T20 |
| 5 Admin | [[plano/tarefas/T20-sorteio]] | opus | T18, T19 | — |
| 6 Qualidade | [[plano/tarefas/T21-testes]] | opus | T08, T16, T20 | T22 |
| 6 Qualidade | [[plano/tarefas/T22-seguranca]] | opus | T08, T16, T18, T21 | — |
| 7 Entrega | [[plano/tarefas/T23-documentacao]] | haiku | T21, T22 | — |
| 7 Entrega | [[plano/tarefas/T24-deploy]] | opus + humano | T23 | — |

## Grafo de dependências (resumo)
```
T00 ─┬─ T01 ─────────────────┐
     ├─ T02                   │
     ├─ T03 ─┬─ T06 ─┐        │
     ├─ T04 ─┤       ├─ T08 ──┼─ T09, T10, T11, T12 ─┐
     └─ T05 ─┘ T07 ──┘        │                      │
            T03+T04 ─ T14 ─┐  └─ T13                 │
            T04 ────── T15 ─┼─ T16 ─ T17 ─┐          │
                            └─ T18 ──────┼─ T19     │
                                         └─ T20 ─┐  │
                                   T21, T22 ◀────┴──┘
                                   T23 ─ T24
```

1. **Janela A** (após T00): T01, T02, T03, T04, T05 ao mesmo tempo (2 haiku + 3 opus).
2. **Janela B**: T06 e T07 em paralelo; T14 e T15 em paralelo (4 subagentes opus, mais 1 haiku para T15a).
3. **Janela C**: T08 sozinho (opus). Enquanto isso, T16 (depende só de T14+T15).
4. **Janela D**: T09, T10, T11, T12, T13, T17, T18 em paralelo (7 subagentes; arquivos disjuntos).
5. **Janela E**: T19, depois T20 (T20 substitui o placeholder do card de sorteio da T19).
6. **Janela F**: T21, depois T22 (T22 usa os snapshots da T21).
7. **Janela G**: T23, depois T24 com o humano.

## Estimativa de custo por modelo
Regra do dono: subagentes **nunca** em Fable; só `haiku` (Haiku 5.5) ou `opus`. Ver [[decisoes/007-orquestracao-por-modelo]].

| Modelo | Tarefas | Observação |
|---|---|---|
| haiku | T01, T02, T09, T12, T13, T15a, T23 | baratas, instruções literais, sem lógica nova |
| opus | T03–T08, T10, T11, T14, T15b, T16–T22, T24 | todo o resto; onde erro custa dinheiro, dados ou visual |
| Fable | nenhuma | só o orquestrador (T00) |

## Regra visual
O design de `/`, `/contribuir`, `/pagamento/[id]` e `/obrigado/[id]` é definitivo. T00 captura `revisao/baseline/`; T09–T13 comparam antes de aceitar; T21 fixa snapshots no Playwright; T22 faz a conferência final.
## Definição de pronto (global)
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run build` verdes.
- `docker compose up` sobe app + db; `/`, `/contribuir`, `/pagamento/[id]`, `/obrigado/[id]`, `/admin` funcionam contra o banco.
- Pagamento sandbox do Mercado Pago aprovado via webhook real.
- Login, lembrar, esqueci senha, convite por e-mail e sorteio demonstrados.
- `wiki/log.md` atualizado com uma entrada por fase; `README.md` descreve execução e pendências.

## Riscos acompanhados
Ver [[analise/estado-atual]] seção "Riscos". Cada tarefa lista em "Não fazer" o que costuma dar errado.
