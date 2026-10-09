---
tipo: decisao
atualizado: 2026-10-09
tags: [decisao, testes, playwright, design-intocavel]
---

# 012 — Snapshots visuais do Playwright partem do estado já validado

## Contexto
A [[plano/tarefas/T21-testes]] manda gerar os snapshots das páginas protegidas a partir de `revisao/baseline/` ou do commit da T00. Nenhum dos dois serve como arquivo de comparação automática: a baseline da T00 foi capturada com dados em `localStorage`, rotas `/pagamento?id=` e `/obrigado?id=` e o banner amarelo de demonstração no topo; o código da T00 não roda contra o banco.

## Decisão
Tomada pelo orquestrador (não envolve dinheiro, dados pessoais nem mudança visual):

1. Os snapshots de `/`, `/contribuir?valor=5`, `/pagamento/<id>` e `/obrigado/<id>` (1280 e 390 px) são gerados do estado atual do branch `producao`, que o orquestrador já comparou com `revisao/baseline/` ao fechar a fase 3. As únicas diferenças aceitas são as registradas nas tarefas: banner removido (T13), botão "Preencher dados de teste" removido (T10) e dados vindos do banco.
2. `revisao/baseline/` continua sendo a referência humana do design original; a T22 repete a comparação manual contra ela.
3. Áreas dinâmicas (valores, cronômetro, QR, números escolhidos, código do pedido) ficam mascaradas.

## Consequências
- Os snapshots protegem contra regressão daqui para a frente, não provam igualdade com o protótipo; essa prova é a comparação manual.
- Snapshots do Playwright dependem de sistema e fontes: os commitados valem para Windows/Chromium; no CI (Linux) o job de E2E roda com `continue-on-error`.
