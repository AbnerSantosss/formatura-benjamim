---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-0, preparacao]
---

# T00 — Preparação do repositório

- **Modelo:** orquestrador (não delegar).
- **Depende de:** nada.
- **Arquivos:** `package.json`, `.prettierrc`, `.prettierignore`, `vitest.config.ts`, `wiki/plano/status.md`, todos os `src/**/*.{ts,tsx}` (só formatação).

## Passos
1. Rodar `node -v`. Precisa ser 22 ou maior. Se não for, instalar e parar aqui.
2. Rodar `git status`. Se houver mudanças não commitadas, commitar o estado atual: `git add -A && git commit -m "Protótipo frontend antes do plano de produção"`. Nunca commitar `.env` (está no `.gitignore`).
3. Criar branch de trabalho: `git checkout -b producao`.
4. Instalar ferramentas: `npm install -D prettier vitest tsx @types/node`.
5. Criar `.prettierrc` com o conteúdo:
   ```json
   { "singleQuote": true, "printWidth": 110, "trailingComma": "all", "semi": true }
   ```
   e `.prettierignore` com:
   ```
   node_modules
   .next
   out
   public
   revisao
   referencias
   registro
   ```
6. Criar `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: { include: ['tests/**/*.test.{ts,mjs}'], exclude: ['tests/integration/**', 'tests/e2e/**'], environment: 'node' },
   });
   ```
7. No `package.json`, trocar/adicionar scripts:
   ```json
   "format": "prettier --write \"src/**/*.{ts,tsx,css}\" \"tests/**/*.{ts,mjs}\"",
   "format:check": "prettier --check \"src/**/*.{ts,tsx,css}\" \"tests/**/*.{ts,mjs}\"",
   "test": "vitest run",
   "test:watch": "vitest"
   ```
   Manter `dev`, `build`, `typecheck`, `lint` como estão.
8. Rodar `npm run format`. Os componentes estavam em uma linha por arquivo; agora ficam legíveis. **Formatação não muda o visual**: Prettier não altera CSS semanticamente nem JSX renderizado.
9. Rodar `npm run typecheck && npm run lint && npm test`. Os 12 testes de `tests/demo.test.mjs` devem passar no Vitest. Se o Vitest reclamar de `node:test`, converter o arquivo: trocar `import { test } from 'node:test'` e `import assert from 'node:assert/strict'` por `import { test, expect } from 'vitest'` e cada `assert.equal(a, b)` por `expect(a).toBe(b)`, `assert.deepEqual` por `toEqual`, `assert.ok` por `toBeTruthy`, `assert.throws` por `expect(() => ...).toThrow()`.
10. Tirar capturas de referência do visual atual (serão comparadas no fim pela T22): com `npm run dev` rodando, salvar em `revisao/baseline/` as páginas `/`, `/contribuir?valor=5`, `/pagamento` (demo) e `/obrigado` (demo), desktop 1280px e mobile 390px. Pode usar Playwright (`npx playwright screenshot --viewport-size=1280,900 URL arquivo.png`) ou o navegador.
11. Criar `wiki/plano/status.md` com uma linha por tarefa T00..T24 no formato `| Txx | pendente | - |` dentro de uma tabela com cabeçalho `| Tarefa | Status | Quando |`.
12. Commit: `git add -A && git commit -m "T00: formatação, Vitest, baseline visual e status do plano"`.

## Critério de aceite
```
npm run format:check
npm run typecheck
npm run lint
npm test
ls revisao/baseline/*.png
git log --oneline -3
```
Todos sem erro; `git status` limpo.

## Não fazer
- Não mudar nenhuma lógica nem CSS; só formatação.
- Não apagar `tests/demo.test.mjs`.
