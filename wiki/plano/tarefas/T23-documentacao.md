---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-7, documentacao, wiki]
---

# T23 — Documentação final e atualização da wiki

- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** T21, T22.
- **Arquivos:** `README.md`, `README_PARA_ABNER.md`, `CODEX_INSTRUCTIONS.md` (nota no topo), `wiki/arquitetura/stack.md`, `wiki/arquitetura/estrutura-de-pastas.md`, `wiki/operacao/como-executar.md`, `wiki/log.md`, `wiki/index.md`.
- **Ler antes:** [[operacao/como-executar]], [[operacao/deploy]], [[integracoes/mercado-pago]] seção "Pendências".

## Passos
1. `README.md` (técnico): o que é, stack, como rodar em dev (passo a passo real, testado), scripts, variáveis (link para a wiki), testes, deploy (resumo + link), estrutura de pastas resumida, pendências para Mercado Pago em produção.
2. `README_PARA_ABNER.md` (não técnico, pt-BR simples): como entrar no painel (primeiro acesso pede troca da senha temporária), como convidar alguém, como ver e estornar pedidos, como exportar CSV, como definir a data do sorteio e gerar o ganhador, o que fazer se um Pix não confirmar (botão de verificação/rodar expiração), onde ficam as senhas e chaves (gerenciador de senhas), como fazer backup. Nada de comandos de terminal além de copiar e colar o que estiver em bloco. **Sem e-mails, senhas ou chaves no texto.**
3. `CODEX_INSTRUCTIONS.md`: inserir no topo um bloco "**Atualização 2026-10-09:** a direção de produto mudou; ver `wiki/decisoes/001-rifa-com-numeros-e-sorteio.md`. As instruções abaixo sobre 'vaquinha sem sorteio' estão desatualizadas. O design da landing, do checkout e da página de obrigado é definitivo e não deve ser alterado." Não apagar o resto.
4. Atualizar na wiki: `stack.md` (coluna "hoje" = alvo alcançado), `estrutura-de-pastas.md` (árvore real via `find src prisma scripts tests -type f | sort`), `como-executar.md` (conferir cada comando rodando de verdade).
5. `wiki/log.md`: entrada `## [AAAA-MM-DD] update | Plano de produção concluído (T00–T23)` com Pedido, O que foi feito, Entregue, Armadilhas.
6. `wiki/index.md`: conferir que toda página existente está listada e que nenhum `[[link]]` aponta para arquivo inexistente.

## Critério de aceite
```
for l in $(grep -rhoE "\[\[[^]|]+" wiki | sed 's/\[\[//' | sort -u); do test -f "wiki/$l.md" || echo "QUEBRADO: $l"; done
grep -rn "hotmail\|gmail\|Mudar@" README.md README_PARA_ABNER.md wiki/ ; echo "(esperado: nada)"
npm run format:check && npm run lint
```

## Não fazer
- Não colocar credenciais, chaves ou e-mails pessoais em nenhum arquivo.
- Não apagar entradas antigas do `wiki/log.md`.
