---
tipo: decisao
atualizado: 2026-10-09
tags: [adr, docker, postgres, portas]
---

# ADR 008 — Portas do Postgres local: 5442 (dev) e 5443 (teste)

**Status:** aceita em 2026-10-09 pelo orquestrador, durante a execução do plano.

## Contexto
As tarefas T02, T03, T06 e T21 foram escritas com o Postgres de desenvolvimento em `127.0.0.1:5432` e o de teste em `127.0.0.1:5433`. Na máquina do dono essas duas portas já estão ocupadas por containers de outros projetos, que não podem ser parados.

## Decisão
- Banco de desenvolvimento (`docker-compose.yml`, serviço `db`): porta do host **5442**.
- Banco de teste (`docker-compose.test.yml`, serviço `dbtest`): porta do host **5443**.
- Dentro da rede do Docker nada muda: o app continua falando com `db:5432`.
- `DATABASE_URL` local passa a ser `postgresql://benjamim:benjamim@localhost:5442/benjamim`; a URL de teste usa `localhost:5443`.

## Consequências
- Onde uma tarefa do plano disser `5432` (host) leia `5442`; onde disser `5433` leia `5443`. Cada tarefa afetada ganhou a seção "Desvios registrados".
- Em produção (VPS) o banco não publica porta para fora; a mudança só afeta desenvolvimento e testes.

Relacionado: [[decisoes/004-stack-de-producao]], [[plano/tarefas/T02-docker]].
