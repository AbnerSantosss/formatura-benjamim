---
tipo: plano
atualizado: 2026-10-11
tags: [plano, go-live, responsividade]
---

# Plano "antes de divulgar" (2026-10-11)

Pedido do dono: resolver as pendências de [[operacao/checklist-producao]] (seção "Antes de divulgar"), deixar o sistema funcionando de ponta a ponta e a landing responsiva. As chaves do Mercado Pago ficam de fora: o dono cadastra depois no painel.

O orquestrador é a sessão principal. Cada agente tem arquivos próprios, não faz commit e não roda `build`, `test:integration` nem `test:e2e` (suítes no mesmo banco dão falha espúria em paralelo). A validação completa é do orquestrador, em série, no fim.

| Tarefa | Modelo | Arquivos | O que entrega |
|---|---|---|---|
| A. Landing responsiva | opus | `src/app/reference.css`, `src/components/reference-landing.tsx` | `/` sem quebra nem rolagem lateral de 320 a 1280 px; 390 e 1280 px iguais ao que já estava validado |
| B. Textos verdadeiros e páginas legais | opus | `src/components/checkout.tsx`, `src/components/number-picker.tsx`, `src/app/[legal]/page.tsx` (serve `/termos`, `/privacidade` e `/regulamento`), `src/components/payment-frame.tsx` | fim das frases falsas do checkout; termos e privacidade coerentes com o que o sistema faz |
| C. Descrição do produto | haiku | `prisma/seed.ts`, `src/lib/demo-model.ts`, migração nova | descrição sem "demonstração sem cobrança ou sorteio real", também nos bancos já semeados |
| D. Expiração e backup agendados | opus | `docker-compose.portainer.yml`, `docker-compose.yml`, `wiki/operacao/deploy.md` | serviços da stack que expiram reservas e fazem backup diário, sem cron manual no servidor |
| E. 403 de origem no sorteio | opus | código de checagem de origem em `src/server` e teste unitário | causa do 403 em `/api/admin/sorteio` no dev e correção |

Depois dos agentes, o orquestrador roda `format:check`, `typecheck`, `lint`, `npm test`, `test:integration`, `test:e2e` e `build`, confere as capturas, faz os commits e atualiza [[log]].

## Fica com o dono
- Primeiro acesso ao `/admin` em produção (a senha só ele digita) e apagar `ADMIN_BOOTSTRAP_PASSWORD` da stack.
- Chaves do Mercado Pago e webhook, pelo painel.
- Desligar o modo demonstração (sem gateway pronto, o checkout mostra o aviso de Pix indisponível).
- Links do Instagram do pai e da mãe, em Configurações.
