# Formatura do Benjamim — frontend de demonstração

Landing, checkout, pagamento simulado e backoffice. Next.js + React + TypeScript, CSS simples e exportação estática. Sem backend, banco, autenticação real ou cobrança. O escopo frontend substitui nesta entrega os requisitos full-stack de `CODEX_INSTRUCTIONS.md`.

## Executar

```sh
npm install
npm run dev
```

Abra http://127.0.0.1:3180. Rotas: `/`, `/contribuir?valor=25`, `/pagamento?id=...`, `/admin`, `/privacidade` e `/termos`.

**Login demonstrativo:** usuário `admin`, senha `benjamim123`. São valores públicos do protótipo, não credenciais de produção. A sessão fica em sessionStorage e não protege dados reais.

```sh
npm run test
npm run lint
npm run typecheck
npm run build
```

O build gera `out/`. Para desenvolver, use `npm run dev`; `next start` não serve exportações estáticas.

## Implementado

- Landing responsiva baseada nas novas referências Desktop/Mobile: hero fotográfico, elementos escolares, estatísticas, contribuição, kits, etapas e agradecimento.
- Kits Boticário masculino e feminino incluídos conforme a solicitação mais recente. Os cartões usam a arte fornecida. São uma apresentação visual: não existe compra de números, inscrição ou mecanismo de sorteio.
- Desktop apresenta contribuição antes dos kits; mobile apresenta kits antes da contribuição. Menu mobile, âncoras, valores R$ 5/10/25/50 e passagem do valor ao checkout.
- Formulário com máscaras e botão para preencher dados fictícios. Nome, CPF, telefone e e-mail não são enviados nem persistidos. Não há validação real de CPF nesta etapa.
- Pagamento com código ilustrativo não pagável, cópia, prazo de 10 minutos, aprovação, expiração e agradecimento simulados.
- Backoffice com login visual, indicadores, busca, filtro por status, exportação CSV, estorno, meta de teste e limpeza das simulações locais.
- Registros salvos somente no localStorage deste navegador: código aleatório, valor, datas e status. Não são compartilhados entre dispositivos. Pendentes e estornados não entram no total aprovado.
- A landing mantém arrecadação inicial estática de R$ 0 e meta de R$ 2.500. A meta e os resultados do painel são exclusivamente da simulação.

## Onde continuar

- `src/components/reference-landing.tsx` e `src/app/reference.css`: landing.
- `src/components/checkout.tsx`: checkout.
- `src/components/demo-payment.tsx`: pagamento e agradecimento.
- `src/components/backoffice.tsx`: login e painel.
- `src/lib/demo-model.ts`: regras e totais simulados.
- `src/lib/demo-store.ts`: persistência local e sessão demonstrativa.
- `src/app/demo.css`: painel e pagamento.
- `src/app/globals.css`: estilos compartilhados e checkout.
- `src/lib/campaign.ts`: campanha e links opcionais da família.
- `tests/demo.test.mjs`: testes de transições, totais e recuperação dos dados locais.

A fotografia original está preservada em `public/images/benjamim.png` e aparece no checkout/agradecimento. O hero usa uma composição gerada a partir dela (`hero-cenario.png`). As referências estão preservadas. O resultado acompanha a composição das artes, mas não é uma reprodução pixel a pixel: marca familiar, textos de vaquinha e indicadores iniciais substituem a identidade institucional e os valores ilustrativos. A escola não é apresentada como organizadora.

## Pendências para Mercado Pago em produção

1. Implementar backend e banco; substituir totalmente o armazenamento e a sessão demonstrativos. Remover `output: 'export'` para usar rotas de servidor, ou hospedar uma API separada.
2. Consultar a documentação oficial vigente da API escolhida; esta entrega não implementa nem valida o contrato do Mercado Pago.
3. Configurar credenciais somente no servidor, criação idempotente de Pix e webhook HTTPS autenticado com verificação junto ao provedor.
4. Usar QR/Copia e Cola reais e confirmar pagamento somente após validação do servidor; tratar expiração, duplicidade e estorno.
5. Conectar progresso público e painel aos pagamentos verificados, implementar autenticação real, validação server-side, proteção de dados e controles de abuso.
6. Revisar os textos, contatos da família, privacidade, reembolsos e destino de excedentes. Definir separadamente as condições dos kits antes de qualquer divulgação de participação; esta interface não implementa sorteio.
7. Executar testes de integração/sandbox e remover todos os controles de simulação antes de ativar cobranças.

Nenhuma transação financeira foi executada. O código de demonstração não é um Pix válido.

## Verificação realizada

- 6 testes automatizados passaram: totais, duplicidade, estorno, expiração e tratamento dos dados locais.
- Lint, TypeScript e build estático passaram.
- Navegador: checkout com dados fictícios, aprovação de R$ 25 no painel, senha incorreta/correta, filtro, estorno, cópia do código, expiração, persistência após recarga e saída da sessão.
- Landing, checkout, pagamento e painel sem overflow horizontal nas larguras 360, 390, 768, 1024 e 1440 px após correção do tablet. Conferência visual desktop/mobile e menu/âncora dos kits.
- Capturas em `revisao/`. Sem teste de gateway real; não há integração nesta entrega.

## Fundo cartoon do pagamento

A tela `/pagamento` usa `public/images/pagamento-cartoon-chapeu-v2.png`, gerado com a ferramenta integrada image_gen a partir da foto indicada pelo usuário, com chapéu azul decorado e camiseta laranja. A ilustração traz Benjamim, escola, livros, capelo e blocos ABC; centro claro para a leitura do cartão e enquadramento próprio no mobile. O prompt completo está em `revisao/pagamento-cartoon-chapeu-prompt.txt`.
