# Instruções obrigatórias para agentes de código

Leia integralmente `CODEX_INSTRUCTIONS.md` antes de alterar arquivos. As referências visuais estão em `referencias/` e a fotografia original do Benjamim deve ser utilizada na interface.

Sua tarefa é implementar o software funcional, executar testes e resolver erros, não escrever somente um plano. Não exponha dados pessoais ou credenciais. A landing de produção deve funcionar como vaquinha familiar sem sorteio pago; os layouts originais contêm textos de rifa apenas como referências visuais desatualizadas.

Ao finalizar, liste o que foi implementado, como executar, status dos testes e pendências para conectar o Mercado Pago em produção.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
