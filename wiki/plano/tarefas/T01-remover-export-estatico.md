---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-0, next-config]
---

# T01 — Remover export estático e preparar servidor Node

- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** T00.
- **Arquivos:** `next.config.ts`, `src/app/layout.tsx` (só links), `src/components/*.tsx` (só `href` com barra final), `.openai/hosting.json`.
- **Ler antes:** em `node_modules/next/dist/docs/`, os arquivos de configuração cujo nome contenha `output` e `trailingSlash` (usar `find node_modules/next/dist/docs -iname "*output*"`).

## Passos
1. Substituir o conteúdo de `next.config.ts` por:
   ```ts
   import type { NextConfig } from 'next';
   const nextConfig: NextConfig = {
     output: 'standalone',
     images: { unoptimized: true },
     trailingSlash: false,
     devIndicators: false,
   };
   export default nextConfig;
   ```
2. Procurar links internos com barra final: `grep -rn 'href="/[a-z/-]*/"' src/` e `grep -rn 'href={`/' src/`. Em cada um, remover a barra final (ex.: `/admin/` → `/admin`, `/contribuir/` → `/contribuir`). Não mexer em `href="/"`.
3. Procurar `router.push(` e `router.replace(` com barra final e corrigir igual.
4. Renomear `.openai/hosting.json` para `.openai/hosting.static.json.bak` (hospedagem estática deixou de valer; ver [[decisoes/004-stack-de-producao]]).
5. Rodar `npm run build`. Deve concluir sem o erro de export. Confirmar que existe `.next/standalone/server.js`.
6. Rodar `npm run dev` em segundo plano e testar `curl -I http://127.0.0.1:3180/admin` e `curl -I http://127.0.0.1:3180/contribuir`; ambos devem responder 200 (não 308). Encerrar o dev.

## Critério de aceite
```
grep -n "output: 'export'" next.config.ts ; echo "(esperado: nada)"
grep -rn 'href="/[a-z/-]*/"' src/ ; echo "(esperado: nada)"
npm run typecheck && npm run lint && npm test && npm run build
ls .next/standalone/server.js
```

## Não fazer
- Não tocar em CSS, textos, imagens ou estrutura JSX. O design das páginas é intocável.
- Não remover `images.unoptimized` (as imagens são servidas de `public/`).
