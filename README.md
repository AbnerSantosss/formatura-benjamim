# Formatura do Benjamim — protótipo frontend

Landing, escolha de números, colaboração avulsa, Pix simulado, agradecimento e backoffice. Next.js + React + TypeScript e CSS simples. Exportação estática para `out/`.

## Executar

```sh
npm install
npm run dev
```

Abra http://127.0.0.1:3180. Login demonstrativo do painel: `admin` / `benjamim123` (valores públicos do protótipo).

```sh
npm run test
npm run lint
npm run typecheck
npm run build
```

Use `npm run dev` para desenvolver; a exportação estática não usa `next start`.

## Fluxo atual

- Landing com cestas Boticário masculina e feminina, pacotes e link para colaboração avulsa.
- R$ 5 = 10 números, R$ 10 = 20, R$ 25 = 50, R$ 50 = 100. Outros pacotes aceitam múltiplos de R$ 5, até o total de números.
- Lista de 5.000 números, de 0001 a 5000, organizada em 50 blocos de 100. Cada bloco tem uma tabela 10×10. O usuário pode escolher em blocos diferentes, limpar ou completar com números disponíveis.
- No mobile, somente a tabela permite deslocamento horizontal para manter alvos de toque de 44×44 px. A página não deve ter overflow horizontal.
- Colaboração avulsa: valor livre a partir de R$ 5, inclusive centavos, sem números.
- Pix de demonstração: mostra produto, modalidade, valor e números. O código não funciona em aplicativo bancário e não movimenta dinheiro.
- Reserva local dos números por 10 minutos ao criar o pedido; aprovação confirma, expiração e estorno liberam. Renovação preserva o produto e os números e verifica novamente a disponibilidade.
- Agradecimento separado, acessível após aprovação simulada, com família em cartoon, frase centralizada e container translúcido. Em telas curtas, o card possui rolagem interna.
- Backoffice: produtos criados automaticamente, lista de pedidos, filtro por modalidade/status, busca por produto/código/número/valor, aprovação, estorno, CSV, meta e limpeza de testes.
- Dois produtos de catálogo, sem duplicação por pedido: `cestas-boticario` (participação no sorteio) e `colaboracao-avulsa` (sem números). Cada pedido vincula `productId`, `mode`, `numbers`, valor, datas e status.
- Registros antigos são preservados e migrados para colaboração avulsa, sem inventar números para eles.

## Limites desta entrega

Escopo autorizado: frontend de demonstração. A solicitação mais recente substitui nesta prévia a apresentação anterior de vaquinha. Não há backend, banco, autenticação real, cobrança, envio ao Mercado Pago ou apuração real de sorteio.

Os campos pessoais usam dados fictícios e não são persistidos ou enviados. localStorage guarda apenas os pedidos simulados, produtos, números, valores e datas. Limite de 1.000 pedidos locais. sessionStorage guarda a sessão demonstrativa. Esses dados podem ser alterados pelo usuário e não são compartilhados entre dispositivos. A disponibilidade local não garante reserva concorrente entre pessoas, abas ou dispositivos; a produção exige banco e transações atômicas.

A meta pública permanece ilustrada com arrecadação inicial de R$ 0; resultados reais de gateway não existem. O painel calcula apenas os testes deste navegador.

## Produção e Mercado Pago — pendente

1. Validar o enquadramento jurídico da operação e a aceitação expressa pelo provedor antes de cobrar por números. A ausência de tráfego pago e o caráter familiar não são tratados aqui como autorização. A orientação do Ministério da Fazenda sobre rifas pode ser consultada em https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/apostas-de-quota-fixa/tire-suas-duvidas/rifas/as-rifas-sao-permitidas-no.
2. Cadastro como “produto” organiza o catálogo, mas não altera a natureza da participação no sorteio. Nenhum título/categoria de venda de bens foi criado para ocultar essa natureza ao gateway. A colaboração avulsa tem descrição separada.
3. Implementar backend, banco e autenticação real. Produtos devem ser criados idempotentemente por código; pedidos e itens devem preservar o produto/modalidade, valor e números. Não usar localStorage para reservas reais.
4. Implementar reserva exclusiva por número no banco, expiração e liberação transacionais, confirmação e estorno idempotentes. Verificar preço, quantidade, identidade e disponibilidade no servidor.
5. Consultar a documentação oficial vigente da API aprovada pelo provedor. Esta entrega não contém nem valida um payload de Mercado Pago e não cria produtos no serviço externo.
6. Credenciais somente no servidor. QR/Copia e Cola reais somente após criação validada; confirmar via webhook HTTPS autenticado e consulta server-to-server, validando status, referência e valor.
7. Revisar condições das cestas, data e método de apuração, elegibilidade, entrega, contatos, privacidade, reembolso e destino de excedentes. Nenhum mecanismo de apuração está implementado.
8. Testar em sandbox e remover os controles de simulação antes de qualquer cobrança. Não existe um botão frontend para ativar cobrança real neste protótipo.

## Arquivos principais

- `src/components/reference-landing.tsx` / `src/app/reference.css`: landing e kits.
- `src/components/checkout.tsx` / `src/components/number-picker.tsx`: modalidades e grade.
- `src/lib/demo-model.ts`: catálogo, preço, validação, reserva, transições e totais.
- `src/lib/demo-store.ts`: armazenamento local e sessão demonstrativa.
- `src/components/demo-payment.tsx` / `src/components/order-details.tsx`: Pix e item do pedido.
- `src/components/demo-thanks.tsx` / `src/app/obrigado/thanks.css`: agradecimento.
- `src/components/backoffice.tsx` / `src/components/product-catalog.tsx`: pedidos e produtos.
- `src/app/order-flow.css`: estilos das modalidades, números e catálogo.
- `tests/demo.test.mjs`: testes do modelo.

## Imagens

Fotos originais preservadas: `public/images/benjamim.png` e `public/images/familia-benjamim.png`. Assets derivados via image_gen integrado:

- `familia-benjamim-cartoon.png`: família ilustrada no agradecimento. Prompt: `revisao/familia-cartoon-prompt.txt`.
- `pagamento-cartoon-chapeu-v2.png` e `pagamento-cartoon-chapeu-mobile.png`: fundo do pagamento baseado na foto do chapéu azul e camiseta laranja. Prompts na pasta `revisao/`.
- `hero-cenario.png`: composição do hero baseada na fotografia original.

Referências Desktop/Mobile mantidas. A identidade familiar e os textos atuais substituem textos desatualizados dos mockups; não é uma reprodução pixel a pixel.

## Validação

12 testes do modelo passaram, incluindo pacotes, seleção exata, duplicidade, reserva, expiração, estorno, colaboração avulsa, migração e catálogo. TypeScript e lint passaram. Verificações de navegador: escolha entre blocos, último número 5000, reserva, aprovação, expiração, renovação, estorno, valor avulso com centavos, produtos automáticos e filtro por número/modalidade. Capturas em `revisao/`.

A revisão está disponível localmente. A publicação Sites anterior está indisponível no conector (projeto não encontrado, 404); o endereço hospedado não contém estas revisões.

## Seleção aleatória

O botão azul Selecionar aleatoriamente monta um novo conjunto com a quantidade exata do pacote, sem repetição e excluindo números ocupados. Uma nova utilização substitui a seleção anterior. Completar com disponíveis continua preservando a seleção manual. Limpar escolha usa ícone, borda e fundo rosa suave. Botões verificados em desktop e mobile; testes cobrem quantidade, limites e disponibilidade.

## Revisão visual do seletor

O seletor inteiro tem um painel azul claro para contrastar com as células brancas. Os números escolhidos aparecem em pílulas douradas dentro de um container branco. A frase repetida que enumerava a equivalência dos pacotes foi removida do modo de números. O CTA final é “Quero garantir meus números!” e, na colaboração avulsa, “Quero ajudar esse sonho!”, mantendo a indicação de simulação ao redor. A lógica de reserva e pagamento de teste não foi alterada.
