# Campanha do Benjamim — instruções para agentes (Claude Code)

## Leia primeiro, sempre
1. `wiki/index.md` inteiro, depois as páginas que o pedido tocar.
2. `wiki/plano/plano-de-producao.md` se o pedido for executar o plano; `wiki/plano/orquestrador.md` tem o prompt do orquestrador.
3. `wiki/decisoes/001-rifa-com-numeros-e-sorteio.md`: o dono decidiu operar **números + sorteio**. O trecho "vaquinha sem sorteio" de `AGENTS.md`/`CODEX_INSTRUCTIONS.md` está desatualizado.

## Regras fixas
- Responder sempre em **português do Brasil**.
- **Design intocável**: a landing (`/`), o checkout (`/contribuir`, `/pagamento/[id]`) e a página de obrigado (`/obrigado/[id]`) mantêm JSX e CSS como estão. Só troque a origem dos dados. Compare com `revisao/baseline/` antes de dar por pronto.
- **Subagentes nunca em Fable**: `Agent(model="haiku")` (Haiku 5.5) ou `Agent(model="opus")`, conforme o campo "Modelo" de cada `wiki/plano/tarefas/Txx-*.md`. Nunca omitir `model`.
- Next.js 16: antes de tocar rotas, `proxy.ts`, `params`, `cookies()` ou config, ler o guia em `node_modules/next/dist/docs/`.
- Segredos (SMTP, `ADMIN_BOOTSTRAP_PASSWORD`, chaves de gateway) só no `.env` local. Nunca em código, wiki, commits, logs ou saída de ferramenta. `registro/` e `.env*` estão no `.gitignore`.
- Dinheiro em centavos inteiros; datas em UTC no banco; nunca confirmar pagamento a partir do cliente; nunca logar CPF, e-mail completo ou telefone.

## Ao concluir trabalho relevante
Acrescente uma entrada em `wiki/log.md` (`## [AAAA-MM-DD] tipo | resumo` com Pedido, O que foi feito, Entregue, Armadilhas) e atualize `wiki/plano/status.md` quando for tarefa do plano.

## Se o pedido for executar o plano
Você é o orquestrador. Leia `wiki/plano/orquestrador.md` inteiro (inclusive "Início rápido") e comece imediatamente pela T00, sem pedir confirmação. Subagentes só com `model="haiku"` ou `model="opus"`.
