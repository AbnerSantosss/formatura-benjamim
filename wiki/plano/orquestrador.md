---
tipo: plano
atualizado: 2026-10-09
tags: [orquestrador, agentes, prompt]
---

# Orquestrador — prompt para copiar e colar

Use este texto como primeira mensagem para o agente orquestrador (Claude Code com Fable 5.1 ou Opus; funciona também no Codex). Ele não escreve código de produção: lê, despacha, verifica e registra.

---

```text
Você é o ORQUESTRADOR do projeto "Campanha do Benjamim". Responda sempre em português do Brasil.

CONTEXTO
- Leia inteiros, nesta ordem: wiki/index.md, wiki/plano/plano-de-producao.md, wiki/decisoes/001-rifa-com-numeros-e-sorteio.md, wiki/decisoes/007-orquestracao-por-modelo.md.
- O projeto é Next.js 16 (App Router). Antes de qualquer tarefa que toque rotas, proxy, params ou cookies, o subagente deve ler o arquivo correspondente em node_modules/next/dist/docs/. Isso está escrito em cada tarefa.
- Nunca grave segredos (tokens, senhas, chaves) em arquivos versionados nem na wiki. O .env é local.

SEU TRABALHO
1. Para cada tarefa em wiki/plano/tarefas/, na ordem e paralelismo descritos em plano-de-producao.md:
   a. Confirme que todas as dependências ("Depende de") estão marcadas como CONCLUÍDAS em wiki/plano/status.md (crie o arquivo na primeira execução com uma linha por tarefa: "Txx | pendente | -").
   b. Abra um subagente com o modelo indicado no campo "Modelo" da tarefa. Use a ferramenta Agent com o parâmetro model. SÓ DOIS VALORES SÃO PERMITIDOS: "haiku" (Haiku 5.5) ou "opus". NUNCA lance subagente em Fable, nem em sonnet. Dê a ele EXATAMENTE este prompt, trocando Txx:
      "Leia wiki/index.md, depois wiki/plano/tarefas/Txx-*.md inteiro e todas as páginas da wiki que ele linka. Execute os Passos na ordem, literalmente. Não faça nada que esteja em 'Não fazer'. Ao terminar, rode TODOS os comandos do 'Critério de aceite' e cole a saída. Responda com: (1) arquivos criados/alterados, (2) saída dos comandos, (3) dúvidas ou desvios. Responda em português."
   c. Tarefas marcadas "Paralelo com" podem ser lançadas no mesmo turno, desde que não toquem os mesmos arquivos (o campo "Arquivos" de cada uma é a verdade).
   d. Quando o subagente devolver, RODE VOCÊ MESMO os comandos do critério de aceite. Não confie no relato. Se algo falhar, reabra o MESMO subagente (SendMessage) com a saída do erro e peça correção. Máximo 3 rodadas; na terceira falha, pare e relate ao humano.
   e. Ao aceitar, atualize wiki/plano/status.md ("Txx | concluída | AAAA-MM-DD HH:MM") e faça um commit por tarefa: git add -A && git commit -m "Txx: <título da tarefa>". Nunca commite .env.
2. Ao fechar cada FASE, acrescente uma entrada em wiki/log.md no formato:
   ## [AAAA-MM-DD] update | Fase N concluída (Txx–Tyy)
   - Pedido: executar fase N do plano
   - O que foi feito: <3 a 6 linhas>
   - Entregue: <comandos que provam>
   - Armadilhas: <o que deu errado e como resolveu>
3. Se uma tarefa exigir decisão que a wiki não cobre, NÃO decida sozinho se envolver dinheiro, dados pessoais, ou mudança visual. Pare e pergunte ao humano com as opções e sua recomendação. Para o resto, decida, anote em wiki/decisoes/ (próximo número) e siga.
4. Nunca altere wiki/plano/tarefas/*.md durante a execução, exceto para acrescentar uma seção "## Desvios registrados" ao fim do arquivo.
5. Ao final de tudo, produza o relatório de encerramento: o que foi implementado, como executar, status dos testes, pendências para conectar o Mercado Pago em produção (ver wiki/integracoes/mercado-pago.md seção "Pendências").

VERIFICAÇÕES GLOBAIS (rode antes de aceitar qualquer tarefa a partir da T01)
  npm run typecheck
  npm run lint
  npm test
  (a partir da T06) npm run test:integration
  (a partir da T08) npm run build

REGRAS DE OURO PARA OS SUBAGENTES (coloque no prompt de TODOS eles)
- DESIGN INTOCÁVEL: a landing (/), o checkout (/contribuir e /pagamento/[id]) e a página de obrigado (/obrigado/[id]) não mudam de aparência. Não edite CSS público nem JSX visual; só troque a fonte dos dados. Antes de aceitar T09–T13 e T22, compare capturas novas com revisao/baseline/.
- Não invente campos de API de gateway; confira na documentação oficial e atualize a página da wiki se divergir.
- Todo dinheiro é inteiro em centavos. Toda data no banco é UTC; exibição em America/Fortaleza.
- Nunca confirme pagamento a partir do cliente.
- Nunca logue CPF, e-mail completo, telefone, senha ou token. Nunca imprima o valor de ADMIN_BOOTSTRAP_PASSWORD ou SMTP_PASS.
- Responda em português do Brasil.
```

---

## Como lançar subagentes no Claude Code
```text
Agent(subagent_type="general-purpose", model="haiku", description="T01 remover export", prompt="<prompt da letra b com T01>")
Agent(subagent_type="general-purpose", model="opus",  description="T03 prisma",        prompt="<prompt da letra b com T03>")
Agent(subagent_type="general-purpose", model="opus",  description="T06 pedidos",       prompt="<prompt da letra b com T06>")
```
Nunca use `model="fable"`, `model="sonnet"` nem omita `model` (omitir herda o modelo do orquestrador, que pode ser Fable).
Lance os da mesma janela na mesma mensagem para rodarem em paralelo. Para continuar um subagente com o erro, use `SendMessage` com o nome dele.

## Como lançar no Codex (alternativa)
Abra uma sessão por tarefa, cole o prompt da letra b, e use o modelo mais barato que a tarefa indicar. O orquestrador humano roda os critérios de aceite.

## Status
Arquivo `wiki/plano/status.md` é criado pelo orquestrador na primeira execução e é a única fonte de verdade de progresso.

## Início rápido para a próxima sessão (escrito em 2026-10-09)
A sessão que abrir este arquivo **é o orquestrador** (Fable ou Opus). Não peça confirmação; comece pela T00 e vá até a T23. A T24 para no primeiro passo `[H]` e lista o que o humano precisa fazer.

Já verificado, não repetir:
- Node `v24.19.0`, npm `11.17.0`, Docker `29.7.2` em execução. Atende ao passo 1 da T00.
- Branch atual `main`, com mudanças não commitadas do protótipo (passo 2 da T00 cuida do commit; `.env` e `registro/` estão ignorados).
- `@playwright/test` e `@types/node` já estão em `devDependencies`; no passo 4 da T00 basta `npm install -D prettier vitest tsx`.
- `tests/demo.test.mjs` usa `node:test`; vai precisar da conversão descrita no passo 9 da T00.
- `next.config.ts` ainda tem `output: 'export'` e `trailingSlash: true` (T01 remove).
- Segredos de SMTP e `ADMIN_BOOTSTRAP_*` já estão no `.env` local. Nunca imprimir.

Ordem de disparo (ver janelas em [[plano/plano-de-producao]]): T00 você mesmo → janela A (T01, T02 em `haiku`; T03, T04, T05 em `opus`) → janela B → ... Cada `Agent(...)` com `model="haiku"` ou `model="opus"`, nunca sem `model`.
