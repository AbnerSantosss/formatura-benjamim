---
tipo: decisao
atualizado: 2026-10-09
tags: [decisao, deploy, docker, cache]
---

# 014 — Build sem banco e imagem de ferramentas para operar o servidor

## Contexto
Na preparação da [[plano/tarefas/T24-deploy]] a imagem Docker foi construída do zero pela primeira vez e não funcionava como [[operacao/deploy]] descrevia:

- o `npm ci` falhava no `postinstall` (`prisma generate` sem o schema);
- o `next build` exigia `DATABASE_URL` e um banco já semeado, porque `/`, `/contribuir` e as páginas legais eram pré-renderizadas lendo a campanha (`revalidate = 30`, da T09). Numa VPS nova o banco ainda está vazio na hora do build;
- a imagem do app não tinha a CLI do Prisma completa, nem `tsx`, nem `scripts/`: `prisma migrate deploy`, `db:seed` e `admin:create` não rodavam dentro do contêiner.

## Decisão
Tomada pelo orquestrador (não envolve dinheiro, dados pessoais nem mudança visual):

1. `/`, `/contribuir` e `/[legal]` passam de `revalidate = 30` para `dynamic = 'force-dynamic'`: são renderizadas a cada visita e o build não toca no banco. JSX e CSS não mudaram.
2. `NEXT_PUBLIC_SITE_URL` chega ao build como build arg (lido do `.env` pelo compose). `DATABASE_URL` e `PAYMENT_GATEWAY` do build são marcadores sem segredo, válidos só na linha do build.
3. O `Dockerfile` ganhou o estágio `tools` (dependências completas, `prisma/`, `scripts/`, `src/`, usuário sem privilégios) e o compose o serviço `tools`, no perfil `tools`. Migração, seed e criação do admin passam a ser `docker compose run --rm tools ...`.

Ensaiado em Docker local com variáveis fictícias (projeto isolado, removido ao final): build com banco vazio, migração, seed, `admin:create`, login, cabeçalhos, `/api/demo/aprovar` 404, processo sem root, `caddy validate`, `pg_dump` e restauração.

## Consequências
- Cada visita à landing e ao checkout faz consultas ao banco. Para o tráfego esperado é irrelevante, e o total arrecadado aparece na hora. Se um dia pesar, a alternativa é cache em memória (`unstable_cache`) em volta da leitura da campanha.
- Com o banco fora do ar ou vazio, `/` responde 500 em vez de servir uma cópia em cache.
- Não verificado: VPS real, certificado do Caddy com domínio, Mercado Pago, SMTP real, e a sequência do `deploy.md` rodada de ponta a ponta na ordem exata.
- O CI ainda semeia o banco antes do build; deixou de ser necessário.
