---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, plano, agentes, modelos]
---

# ADR 007 — Orquestrador + subagentes com modelo de IA por tarefa

**Status:** aceita em 2026-10-09. Revisada no mesmo dia: o dono determinou que **subagentes nunca rodam em Fable**; só `opus` ou Haiku 5.5 (`haiku`). Sonnet saiu do mapa.

## Contexto
O dono pediu um plano "bem estruturado" com um agente orquestrador que distribui tarefas a subagentes, escolhendo o modelo por tarefa para ser mais rápido e gastar menos tokens, escrito para que "outra IA burra" consiga executar. Depois acrescentou: subagentes não podem ser Fable (custo); usar Opus ou o Haiku 5.5.

## Decisão
- **Orquestrador** roda no modelo mais capaz disponível (Fable 5.1 ou Opus). Ele não escreve código de produção; lê a wiki, despacha tarefas, verifica critérios de aceite rodando comandos, e registra no `wiki/log.md`.
- **Subagentes** recebem **um arquivo de tarefa** (`wiki/plano/tarefas/Txx-*.md`) com: modelo, dependências, arquivos a tocar, passos numerados literais, critério de aceite (comandos que devem passar), e lista de "não fazer".
- **Regra de escolha de modelo** (só dois valores válidos para `Agent(model=...)`):
  | Modelo | Quando | Tarefas |
  |---|---|---|
  | `haiku` (Haiku 5.5) | boilerplate, cópia de padrões já definidos na wiki, CSS, templates de e-mail, documentação, remoção de código, substituição de fonte de dados sem lógica nova | T01, T02, T09, T12, T13, T15a, T23 |
  | `opus` | tudo o mais: schema, env, domínio, transações, dinheiro, webhooks, auth, segurança, sorteio, telas com estado, testes, deploy | T03, T04, T05, T06, T07, T08, T10, T11, T14, T15b, T16, T17, T18, T19, T20, T21, T22, T24 |
  | Fable | **nunca** para subagente | só o orquestrador (T00) |
- **Protocolo de cada tarefa**: ler `wiki/index.md` + a página da tarefa + páginas linkadas → executar → rodar critérios de aceite → devolver relatório curto (arquivos tocados, comandos rodados com resultado, dúvidas). O orquestrador **re-executa** os critérios antes de aceitar.
- Tarefas independentes rodam em paralelo (ver grafo em [[plano/plano-de-producao]]). Nunca duas tarefas no mesmo arquivo ao mesmo tempo.
- **Design intocável**: `/`, `/contribuir`, `/pagamento/[id]` e `/obrigado/[id]` mantêm JSX e CSS como estão; as tarefas de front só trocam a origem dos dados e comparam capturas com `revisao/baseline/`.

## Consequências
- Haiku cobre 7 tarefas baratas; Opus cobre as 18 restantes. Sem camada intermediária, uma tarefa "média" custa Opus em vez de Sonnet; aceito em troca de menos retrabalho.
- O plano pode ser executado por Claude Code (`Agent` com `model`), por Codex, ou por humano, porque cada tarefa é autocontida.

Relacionado: [[plano/orquestrador]].
