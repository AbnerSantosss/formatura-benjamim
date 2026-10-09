---
tipo: tarefa
atualizado: 2026-10-09
tags: [tarefa, fase-3, copy, legal]
---

# T13 — Textos legais, regulamento e remoção do modo demonstração

- **Modelo:** haiku (Haiku 5.5).
- **Depende de:** T01.
- **Arquivos:** `src/app/layout.tsx`, `src/app/demo.css` (remover), `src/app/[legal]/page.tsx`, `src/components/shared.tsx` (rodapé, se tiver link legal).
- **Ler antes:** [[decisoes/001-rifa-com-numeros-e-sorteio]], [[fluxos/sorteio]], `src/app/[legal]/page.tsx`.

> **Regra do dono: o design da página principal, do checkout e da página de obrigado é intocável.** Esta tarefa só remove o banner de demonstração (que está **fora** do design das páginas, no layout) e escreve os textos das páginas legais. Se remover `demo.css` mudar qualquer coisa visual nas três páginas, mover a regra afetada para `globals.css` sem alterá-la.

## Passos
1. Em `layout.tsx`, remover a `<div className="demo-banner">…</div>` e o `import './demo.css'`. Rodar `grep -rn "demo-" src/app/*.css src/components` para achar classes de `demo.css` usadas fora do banner; mover essas regras, sem mudar, para `globals.css`. Só então apagar `src/app/demo.css`.
2. Em `[legal]/page.tsx` (Next 16: `const { legal } = await params`), garantir três páginas: `termos`, `privacidade`, `regulamento`. Remover qualquer frase com "demonstração", "nenhum pagamento real", "simulação".
3. Conteúdo do **regulamento** (texto em pt-BR, parágrafos curtos):
   - Organizador: família do Benjamim (sem CPF/endereço na página); contato por e-mail/WhatsApp configurado.
   - Como participar: contribuição de múltiplos de R$ 5 via Pix; cada R$ 5 = 10 números de 0001 a 5000; números reservados por 10 minutos até a confirmação do pagamento.
   - Elegibilidade: só números de contribuições confirmadas até o momento do sorteio.
   - Sorteio: data e hora divulgadas na página inicial e definidas pelo organizador; sorteio eletrônico aleatório entre os números elegíveis, com registro do resultado; cada número tem a mesma chance.
   - Prêmio: conforme descrito na página inicial; entrega combinada diretamente com a pessoa sorteada.
   - Contato com a pessoa sorteada: pelo e-mail e WhatsApp informados; prazo de 7 dias para resposta antes de novo sorteio.
   - Estornos: solicitados ao organizador; contribuições estornadas perdem os números.
   - Dados pessoais: usados apenas para a campanha; CPF armazenado cifrado; ver política de privacidade.
   - Aviso: "Esta é uma campanha familiar de arrecadação com sorteio de brinde entre os colaboradores."
4. **Privacidade**: listar dados coletados (nome, CPF, telefone, e-mail, números, valor), finalidade, prazo (até 90 dias após o sorteio, depois anonimização), direitos (acesso, correção, exclusão) com o e-mail de contato, e que o pagamento é processado pelo Mercado Pago.
5. **Termos**: uso da plataforma, idade mínima 18 anos, proibição de automação, limitação de responsabilidade do organizador.
6. Rodapé: se já existirem links legais, apontar para `/termos`, `/privacidade`, `/regulamento`. Se **não** existirem, não criar (seria alterar o design); registrar no relatório para o dono decidir.
7. Rodar `grep -rni "demonstra\|simula\|pagamento real" src/` e remover o que restar fora de código de `isDemo`.
8. Capturas de `/` desktop e mobile comparadas com a baseline (o banner some; o resto é idêntico).

## Critério de aceite
```
test ! -f src/app/demo.css && echo css-removido
grep -rni "demo-banner\|DEMONSTRAÇÃO" src/ ; echo "(esperado: nada)"
npm run typecheck && npm run lint && npm test && npm run build
curl -s http://127.0.0.1:3180/regulamento | grep -c "sorteio"
```

## Não fazer
- Não escrever CPF, endereço ou dados pessoais do organizador nas páginas.
- Não prometer "autorização" legal que não existe; usar a frase do item 3 "Aviso".
- Não alterar nada visual nas três páginas protegidas.

## Desvios registrados
- (2026-10-09) `demo.css` estilizava checkout, pagamento, obrigado, login e backoffice, não só o banner: as 1093 linhas restantes foram copiadas sem alteração para o fim de `globals.css` (mesma posição na cascata, antes de `order-flow.css`). Só as três regras de `.demo-banner` ficaram de fora.
- (2026-10-09) Removidas de `obrigado/thanks.css` e `pagamento/payment-viewport.css` as regras que só escondiam o banner nessas páginas (sem efeito visual).
- (2026-10-09) Passo 7 NÃO executado nas páginas protegidas: os textos de demonstração de `reference-landing.tsx`, `checkout.tsx`, `number-picker.tsx`, `payment-frame.tsx` (modo demo) e `thanks-view.tsx` continuam, porque trocá-los muda o texto da landing, do checkout e do obrigado e depende do dono. O grep do critério (`DEMONSTRAÇÃO`) ainda acusa essas linhas. Pendência obrigatória antes de ligar cobrança real.
- (2026-10-09) O rodapé não tem link para `/regulamento`; não foi criado (decisão do dono).
- (2026-10-09) `.admin-login` e `.admin-shell` ainda usam `min-height: calc(100vh - 32px)` (altura do banner antigo); a T19 ajusta.
- (2026-10-09) A privacidade promete anonimização em 90 dias após o sorteio, como manda a tarefa; não existe rotina que faça isso (pendência para a T22 ou decisão do dono).
- (2026-10-09) As páginas legais leem o Instagram da campanha `main` (ADR 011) com `revalidate = 30`.
