# Instruções obrigatórias para agentes de código

Leia integralmente `CODEX_INSTRUCTIONS.md` antes de alterar arquivos. As referências visuais estão em `referencias/` e a fotografia original do Benjamim deve ser utilizada na interface.

Sua tarefa é implementar o software funcional, executar testes e resolver erros, não escrever somente um plano. Não exponha dados pessoais ou credenciais.

**Atualização 2026-10-09.** A direção de produto mudou: o site opera **números + sorteio**, conforme `wiki/decisoes/001-rifa-com-numeros-e-sorteio.md` (com a ressalva legal registrada lá). O parágrafo original "vaquinha familiar sem sorteio pago" deixou de valer. Leia `wiki/index.md` antes de qualquer alteração e siga `CLAUDE.md` (design da landing, checkout e obrigado intocável; subagentes só em Haiku 5.5 ou Opus; respostas em pt-BR).

Ao finalizar, liste o que foi implementado, como executar, status dos testes e pendências para conectar o Mercado Pago em produção.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
