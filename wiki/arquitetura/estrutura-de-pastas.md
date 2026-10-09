---
tipo: arquitetura
atualizado: 2026-10-09
tags: [estrutura, arquivos]
---

# Estrutura de pastas (estado em 2026-10-09)

```
.
├── AGENTS.md                 # instruções para agentes (aponta a wiki e a decisão 001)
├── CLAUDE.md                 # regra: ler a wiki antes de trabalhar
├── CODEX_INSTRUCTIONS.md     # briefing original (vaquinha sem sorteio), parcialmente superado, ver ADR 001
├── README.md                 # README do protótipo (será reescrito em T22)
├── .env.example              # variáveis sugeridas, sem segredos
├── next.config.ts            # output:'export', trailingSlash, images unoptimized
├── package.json              # scripts dev/build/typecheck/test/lint
├── tests/demo.test.mjs       # 12 testes do modelo puro
├── public/images/            # fotos originais e assets derivados (ver README "Imagens")
├── referencias/              # mockups aprovados (desktop, mobile, checkout)
├── revisao/                  # capturas de tela e prompts de imagem
├── wiki/                     # esta wiki
├── registro/sessoes/         # registro automático de sessões (hook)
└── src/
    ├── app/
    │   ├── layout.tsx        # layout raiz; banner "DEMONSTRAÇÃO" (remover em produção)
    │   ├── page.tsx          # landing -> reference-landing.tsx
    │   ├── contribuir/page.tsx   # checkout (escolha de modalidade, números, dados, resumo)
    │   ├── pagamento/page.tsx    # tela Pix (hoje ?id= no query; alvo: /pagamento/[id])
    │   ├── obrigado/page.tsx     # agradecimento (alvo: /obrigado/[id], validado no servidor)
    │   ├── admin/page.tsx        # backoffice -> backoffice.tsx
    │   ├── [legal]/page.tsx      # /privacidade e /termos
    │   ├── globals.css, demo.css, order-flow.css, reference.css
    │   ├── obrigado/thanks.css, pagamento/payment-viewport.css
    │   └── icon.svg
    ├── components/
    │   ├── reference-landing.tsx # landing completa (hero, meta, como ajudar, kits, como funciona, rodapé)
    │   ├── shared.tsx            # Brand, Header, Portrait, Progress, Footer
    │   ├── checkout-entry.tsx    # lê ?valor= e ?modalidade= e monta Checkout
    │   ├── checkout.tsx          # formulário de pedido (modo números/avulsa, dados, submit)
    │   ├── amount-selector.tsx   # botões R$5/10/25/50
    │   ├── number-picker.tsx     # grade 10x10 por bloco de 100, aleatório, completar, limpar
    │   ├── demo-payment.tsx      # tela Pix simulada (timer, código, simular aprovação)
    │   ├── payment-frame.tsx     # moldura da tela de pagamento
    │   ├── order-details.tsx     # produto + números do pedido
    │   ├── demo-thanks.tsx       # agradecimento (redireciona se não aprovado)
    │   ├── backoffice.tsx        # login demo + painel (visão geral, pedidos, produtos, configurações)
    │   ├── product-catalog.tsx   # cards dos produtos no painel
    │   └── contribution.tsx      # seção antiga de contribuição (não usada na landing atual)
    └── lib/
        ├── campaign.ts           # meta, valores, instagram, money(), resolveAmount()
        ├── demo-model.ts         # modelo puro: produtos, validação, reserva, transições, totais
        └── demo-store.ts         # localStorage/sessionStorage + hooks React
```

## Observações
- Todo arquivo `.tsx` está escrito em **uma linha por componente**. Editar nesse formato gera erro; T00 formata com Prettier antes de qualquer alteração.
- `contribution.tsx` não é importado por ninguém: candidato a remoção.
- `reference.css` e `demo.css` concentram o visual aprovado; não reescrever, só estender.

Ver [[arquitetura/arquitetura-alvo]] para a estrutura após a produção.
