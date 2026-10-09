# Kit pronto para enviar ao Codex

## Arquivos

- `CODEX_INSTRUCTIONS.md`: instruções completas do que construir e testar.
- `referencias/foto-original-benjamim.png`: foto original enviada pela família.
- `referencias/layout-desktop.png`: versão desktop aprovada.
- `referencias/layout-mobile.png`: última versão mobile aprovada (CTA na primeira dobra, meta segunda, seção intermediária terceira e ajuda no final).
- `referencias/layout-checkout-desktop.png`: conceito visual do checkout Pix. O design possui elementos de rifa como referência antiga; siga as instruções atualizadas para uma contribuição voluntária legalmente adequada.
- `.env.example`: estrutura sugerida de variáveis de configuração, sem segredos.

## Como usar

1. Extraia o ZIP em uma pasta `formatura-benjamim` no seu computador.
2. Abra essa pasta no Codex ou no seu editor integrado ao Codex.
3. Envie ao Codex: **Leia o arquivo CODEX_INSTRUCTIONS.md, observe todas as imagens de referencias/ e implemente o projeto completo nesta pasta. Execute testes, lint e build.**
4. O Codex deve criar os arquivos de código, instalar dependências e levantar o projeto.
5. Você fornecerá, depois, os dados de produção (`MP_ACCESS_TOKEN`, webhook secret, DNS, URLs dos dois Instagrams) e publicará após testar.

## Nota importante

O checkout Pix exige credenciais e configurações da sua conta Mercado Pago. Este kit não inclui acesso à conta ou chaves. Seu site é uma campanha familiar não oficial da escola. O sorteio pago mostrado nos mockups originais não está incluído na versão operacional desta especificação.
