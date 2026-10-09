---
tipo: fluxo
atualizado: 2026-10-09
tags: [admin, backoffice, painel]
---

# Fluxo: backoffice (`/admin`)

Visual atual de `src/components/backoffice.tsx` deve ser mantido (sidebar, topbar, métricas, tabela). Muda a fonte de dados: de localStorage para API autenticada.

## Seções
1. **Visão geral** — métricas do banco: aprovado bruto, meta e %, pendente, estornado, números vendidos / disponíveis, contagem de pedidos. Barra de progresso. Card "Sorteio": data configurada, contagem regressiva, botão **Gerar ganhador** ([[fluxos/sorteio]]).
2. **Pedidos** — tabela paginada (20 por página) com busca (nome, e-mail, últimos 4 do CPF, id, número, valor), filtro por status e modalidade, ações: abrir (`/pagamento/[id]`), estornar (com confirmação), reenviar e-mail de confirmação. Exportar CSV (`GET /api/admin/exportar.csv` com os mesmos filtros). CPF sempre mascarado `***.***.***-12`.
3. **Produtos** — cards com título, modalidade, preço, pedidos, aprovado, números confirmados. Edição de título/descrição/ativo.
4. **Usuários** — lista de admins (nome, e-mail, papel, status: convidado / ativo / desativado). Botão "Convidar" (nome + e-mail) envia o e-mail de convite ([[fluxos/autenticacao-admin]]). OWNER pode desativar ADMIN; ninguém desativa o último OWNER.
5. **Configurações** — meta (R$), custos previstos, data e hora do sorteio, exibir resultado do sorteio na landing, Instagram do pai e da mãe, mensagem pública. Card "Gateways": qual está ativo (`PAYMENT_GATEWAY`) e se as credenciais estão presentes (sem mostrar valores). Botão "Rodar expiração agora".

## Segurança
- Todas as rotas `/api/admin/**` exigem sessão válida (`requireAdmin()`), senão 401.
- Ações destrutivas (estornar, desativar usuário, gerar ganhador) exigem confirmação na UI e gravam `AuditLog` com `actorId`.
- Rate limit em login e esqueci-senha (5 tentativas / 15 min por IP + e-mail).

## Removido do protótipo
- "Aprovar teste", "Limpar dados de teste", credenciais de demonstração na tela de login, chip "MODO DEMONSTRAÇÃO". Em `DEMO_MODE` local pode existir um botão "Aprovar (demo)" claramente rotulado.

Tarefas: [[plano/tarefas/T18-api-admin]], [[plano/tarefas/T19-ui-backoffice]].
