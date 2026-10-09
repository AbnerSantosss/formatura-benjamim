# Formatura do Benjamim — interface visual

Entrega limitada ao **visual e à estrutura**, conforme o pedido mais recente. Next.js App Router + React + TypeScript e CSS simples. Sem banco, painel administrativo ou cobrança. As referências originais estão preservadas em `referencias/`.

## Executar

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:3180. Checkout: http://127.0.0.1:3180/contribuir?valor=25

```sh
npm run lint
npm run typecheck
npm run build
```

O build gera `out/`, uma versão estática para hospedagem (incluindo Sites). `next start` não atende exportações estáticas; use `npm run dev` para continuar editando. Para a futura API de pagamentos, remova `output: 'export'` e configure uma hospedagem compatível com o backend.

## Onde editar

- `src/app/page.tsx`: landing.
- `src/app/contribuir/page.tsx`: composição do checkout.
- `src/components/checkout.tsx`: campos, máscaras, seleção e resumo.
- `src/components/contribution.tsx`: área de contribuição da landing.
- `src/components/shared.tsx`: cabeçalho, foto, progresso e rodapé.
- `src/app/globals.css`: todo o visual e responsividade.
- `src/lib/campaign.ts`: meta, valores em centavos e links opcionais.
- `src/app/[legal]/page.tsx`: textos iniciais de privacidade e termos.
- `public/images/benjamim.png`: cópia da fotografia original, sem alteração.

## O que funciona nesta etapa

Navegação, âncoras, seleção de R$ 5/10/25/50, passagem do valor ao checkout, atualização do resumo, máscaras de CPF e telefone, layout responsivo. Campos não enviam nem persistem dados. O botão de pagamento fica bloqueado; não há QR fictício ou confirmação simulada. Meta inicial R$ 2.500 e arrecadação inicial R$ 0, sem consulta a um gateway. Não há validação de dígitos verificadores de CPF nesta etapa visual.

## Continuação por outra IA

O pedido atual substitui o escopo full-stack de `CODEX_INSTRUCTIONS.md` apenas nesta entrega. O arquivo continua sendo a especificação da futura implementação completa. Preserve a direção visual das referências, usando contribuição familiar sem rifas/prêmios, sem logo institucional da escola e sem perfis inventados.

### Pendências para Mercado Pago em produção

1. Implementar backend, banco e agregação real de pagamentos confirmados/estornos.
2. Conferir a documentação oficial vigente da Orders API e os campos aceitos. Esta versão não implementa nem valida esse contrato.
3. Configurar credenciais **apenas no servidor**, criação idempotente de Pix e webhook HTTPS autenticado, com consulta ao provedor.
4. Criar instruções de QR/Copia e Cola, expiração, consulta de status e agradecimento somente após confirmação do servidor.
5. Implementar validação server-side, proteção de dados, rate limiting, autenticação/admin e testes de integração/sandbox.
6. Preencher contatos da família, revisar privacidade/termos e configurar destino de excedentes/reembolsos.
7. Substituir o total inicial estático por dados reais. Habilitar pagamentos e indexação somente depois da validação completa.

Não houve transação financeira nesta entrega. Nenhuma credencial é necessária para visualizar as páginas.

## Verificação desta entrega

- Build estático e TypeScript aprovados; lint sem erros.
- Landing e checkout conferidos no navegador nas larguras 360, 390, 768, 1024 e 1440 px: sem overflow horizontal.
- CTA da landing dentro da primeira dobra móvel (aproximadamente 497–509 px nos testes de 360/390 px).
- Verificados: âncora de contribuição, seleção de R$ 50 e passagem pela URL, troca do resumo para R$ 10, máscaras com dados fictícios e botão de pagamento desativado.
- Não há suíte de testes financeiros: integração, backend e pagamentos estão fora do escopo desta etapa.
- Não é reprodução pixel a pixel: a fotografia original e os textos de vaquinha substituem a montagem e o conteúdo de rifa. A escola não é apresentada como organizadora.
