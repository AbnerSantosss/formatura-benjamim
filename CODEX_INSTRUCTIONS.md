# Missão para Codex — Site de arrecadação da formatura do ABC do Benjamim

Você é um engenheiro full-stack sênior e designer UX/UI. CONSTRUA E TESTE este projeto, não entregue somente um plano ou pseudocódigo. Use como referência os arquivos visuais existentes em `referencias/`, sobretudo `layout-desktop.png`, `layout-mobile.png`, `layout-checkout-desktop.png` e a fotografia original `foto-original-benjamim.png`.

## Contexto e limite legal

O pai, Abner Santos, deseja montar uma página bonita e emocional para familiares contribuírem com a formatura do ABC de seu filho Benjamim (aluno da Knox Kids, https://knoxkids.com.br/). A formatura custa R$ 2.000 e há uma reserva de R$ 300 para despesas adicionais. Meta pública de arrecadação bruta: **R$ 2.500**, para contemplar taxas do gateway. A participação é **voluntária**.

A arte de referência menciona "rifa", "prêmios" e números por sorteio, mas NÃO transforme esses elementos em mecânica operacional de sorteio associado a contribuições. No Brasil, rifa particular com venda de bilhetes numerados não é permitida; para sorteios autorizados aplicam-se outras regras. A primeira versão deve ser uma **vaquinha familiar sem sorteio, compra de números ou promessa de prêmio**. Não mostrar cartões "kits Boticário" ou textos de sorteio na página pública; mantenha a composição de terceira seção para "Nossa história / O que estamos celebrando", com uma foto ou elemento de celebração. Não criar um recurso que a produção possa habilitar por engano sem revisão legal explícita.

Evite representar a Knox Kids como organizadora, parceira oficial ou destinatária do dinheiro: é iniciativa da família; use "Aluno da Knox Kids" e referência textual à escola, não uma logo oficial/identidade institucional sem licença. Os mockups contêm logos e perfis possivelmente ilustrativos; não os trate como autorizados ou confirmados.

## Stack e entrega técnica

- Next.js App Router estável + TypeScript com strict mode.
- Tailwind CSS, componentes React acessíveis; shadcn/ui opcional, com design realmente personalizado (não interface de template genérico).
- PostgreSQL + Prisma migrations.
- Checkout Pix com **Mercado Pago Checkout Transparente / Orders API** atual, conforme documentação oficial; SDK oficial se estável, ou REST tipada server-side. NÃO expor Access Token no navegador.
- Dockerfile multi-stage e `docker-compose.yml` (app + Postgres) prontos para VPS; `.env.example` sem credenciais reais.
- Validação Zod; CPF com dígitos verificadores, máscara na UI, celular brasileiro, email e saneamento. Use valores monetários em centavos inteiros.
- Testes com Vitest (unitários e integração) e Playwright (smoke/E2E quando possível); lint + typecheck + build.
- README com execução local, migração/seeds, testes, integração MP, Webhooks, produção, privacidade, limitações e checklist antes de publicar.
- Entregar código executável completo, não mocks como se fossem dados reais.

## Direção visual — fidelidade às referências

1. Desktop: hero em duas colunas, texto emocional à esquerda e retrato do Benjamim à direita; ambiente alegre, claro, premium infantil sem aparência de imagem automática. CTA amarelo na primeira dobra: **"Quero ajudar esse sonho"**.
2. Mobile: primeiro contato com o Benjamim, headline, CTA amarelo em largura quase total **dentro da primeira dobra**; nunca deixar o CTA somente no final do site.
3. Seção 2 imediatamente após hero: faixa branca de estatísticas + barra de progresso verde: **Meta R$ 2.500, já arrecadamos R$ X, falta R$ Y, %**. No mobile, estatísticas empilhadas ou em grade legível, sem texto minúsculo ou cortes.
4. Seção 3: história da conquista, mensagem da família, conquistas do ABC e eventual foto; preserva espaço no layout onde o mockup mostra prêmios, porém sem sorteio pago.
5. Seção 4 final: bloco azul-marinho **"Como você pode ajudar?"** + seletor de contribuições (R$ 5, R$ 10, R$ 25, R$ 50) e CTA amarelo **"Quero contribuir via Pix"**.
6. Rodapé com links editáveis para os perfis de Instagram dos dois pais, texto **"Site desenvolvido pelo pai, Abner Santos"**, mensagem de agradecimento, privacidade e termos.
7. Cores: azul-marinho `#062E66`/`#073C83`, azul bebê `#EAF7FF`, amarelo `#FFC928`, verde progresso `#13B86A`, branco. Use tipografia profissional legível, espaçamento consistente, ícones vetoriais (Lucide), cantos suaves e hierarquia excelente.
8. Use a fotografia real `referencias/foto-original-benjamim.png` como fonte de imagem, não invente outra criança nem use recorte de screenshot como imagem da página. Otimize com `next/image`. Se não houver recorte transparente, use moldura de foto, gradientes, máscara decorativa CSS e alinhamento cuidadoso.
9. UI totalmente responsiva em 360/390/768/1024/1440px, WCAG AA básico, contraste e foco teclado. Preservar 44px mínimo para alvos touch.
10. Seções com scroll anchors e CTA da primeira dobra levando à seção de contribuição/checkout.
11. Não exibir números de arrecadação fictícios do mockup (R$ 1.750/70%). A campanha REAL começa em R$ 0,00.

## Fluxo funcional

- `GET /`: landing page com dados reais de arrecadação agregados pelo servidor (somente pagamentos confirmados, menos estornos). Revalidação/SWR polling discreto 15-30s, sem precisar websockets.
- `GET /contribuir?valor=25`: formulário de checkout simples. Campos **nome completo, CPF, WhatsApp, e-mail**; todos obrigatórios nesta versão a pedido da família. Exibir explicação de uso de dados e link de privacidade. A Orders API do Mercado Pago pode requerer só e-mail; enviar CPF ao gateway **apenas se a modalidade efetivamente exigir e aceitar o campo**, sem inventar propriedades. Valide API real.
- `POST /api/contribuicoes`: receber valor permitido (5/10/25/50 em BRL), validar limites server-side, criar registro `pending` com UUID externo, criar order/pagamento Pix no Mercado Pago, devolver instruções Pix/QR/Copia e Cola e identificador da contribuição. Idempotência por requisição para impedir cobranças duplicadas.
- `GET /pagamento/[id]`: tela com total, cronômetro de expiração informado pela API, Pix Copia e Cola, QR code e estado sincronizado (pending/approved/expired/refunded). Não afirmar "pagamento confirmado" com base só na tela cliente.
- `POST /api/webhooks/mercadopago`: validar `x-signature`, `x-request-id` e data.id conforme documentação mais recente e o recurso usado; comparar HMAC em tempo constante. Fazer fetch server-to-server da order para conferir status, valor, referência e recebimento, nunca confiar só no POST recebido. Persistir idempotentemente, resistir a notificações duplicadas/fora de ordem, sem contabilizar pagamento duas vezes. Processar estorno/cancelamento. Nunca revelar segredo em logs.
- `GET /api/contribuicoes/[id]/status`: status mínimo público acessível apenas com token opaco aleatório ligado à contribuição, sem devolver CPF, e-mail ou telefone.
- `GET /obrigado/[id]`: agradecimento somente quando servidor confirmou status `approved`. Se pendente, redirecionar para instruções de pagamento.
- `GET /privacidade` e `GET /termos`: textos iniciais transparentes, editáveis, sem parecer texto jurídico definitivo; informar controlador familiar, finalidade CPF/WhatsApp/email, provedor de pagamento e contato para exclusão.
- Administrador `/admin`: autenticação real e dashboard protegido. Métricas: meta bruta, bruto confirmado, total de contribuições confirmadas, pendências, estornos, taxas efetivas se API fornecer; caso contrário taxa estimada bem sinalizada e editável. Custo previsto de R$ 2.300 e meta bruta R$ 2.500. Resultado líquido = confirmado bruto menos tarifas efetivas conhecidas ou estimativa rotulada. Relatórios CSV; listagem paginada, busca e filtros; editar meta/mensagem/URLs do Instagram e configuração de campanha.
- Provisionar a conta admin por script `pnpm admin:create` com credenciais obtidas interativamente ou variáveis de ambiente descartáveis, nunca senha padrão. Sessões HttpOnly/Secure/SameSite, bcrypt/argon2, CSRF, rate limiting de login e endpoints sensíveis.
- Variáveis `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_ENVIRONMENT=test|production`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `CPF_ENCRYPTION_KEY`, `NEXT_PUBLIC_SITE_URL` e outras necessárias.
- Modo `DEMO_MODE=true` apenas para ambiente local/dev permite simular pagamento sem rede; deve falhar fechado se habilitado em NODE_ENV=production. Produção sem credenciais reais deve bloquear botão de cobrança com mensagem de configuração (não permitir cobrança falsa).

## Banco e integridade

Tabelas mínimas: `Campaign`, `CampaignSettings`, `Contributor`, `Contribution`, `Payment`, `WebhookEvent`, `AdminUser`, `AuditLog`.

- Valores centavos inteiros, IDs opacos, createdAt/updatedAt, chaves únicas provider order id, external_reference, webhook event id, idempotency key.
- Salvar CPF cifrado em repouso (AES-256-GCM com chave externa ou mecanismo equivalente) e mascarar no painel; proibir CPF completo nos logs e URLs. Evitar coleta redundante; política de retenção clara e rotina de exclusão/anonimização quando cabível. Não inserir dados pessoais reais no seed.
- Estatísticas sempre do banco, calculadas de transações aprovadas e liquidadas segundo documentação, descontando reembolsos. Não incluir Pix pendente no arrecadado.
- Padrão de status monotônico e conciliação segura quando chegam atualizações assíncronas.
- Índices úteis, atomicidade, constraints, transações para alterar estado; não confiar em cálculos client-side.

## Copywriting

- Hero: "Ajude o Benjamim a celebrar sua formatura do ABC".
- Apoio: "Uma conquista cheia de descobertas, sorrisos e aprendizado. Nossa família vai guardar este dia para sempre. Sua contribuição torna esse momento ainda mais especial.".
- CTA 1: "Quero ajudar esse sonho".
- Progresso: "Nossa meta", "Já arrecadamos", "Falta para a meta".
- Seção 3: "Uma conquista para celebrar em família".
- Área final: "Como você pode ajudar?" / "Escolha um valor para contribuir" / "Quero contribuir via Pix".
- Agradecimento: "Obrigado por fazer parte desse momento tão especial na vida do Benjamim!".
- Linguagem calorosa, familiar, clara, sem urgência artificial, sem promessa de prêmio.

## Regras e segurança para publicação

- Sem sorteio ou numeração paga nesta primeira versão.
- Não usar marca da escola como responsável pela arrecadação sem autorização. Texto "aluno da Knox Kids" é suficiente.
- Não usar imagens de kits Boticário como incentivo à doação vinculada a prêmios.
- Não exibir handles dos pais inventados: usar campos configuráveis e rótulos enquanto não forem preenchidos, ocultando links vazios no público.
- Não criar botão ou QR Code simulando Pix real quando faltar integração ativa.
- Página de privacidade e proteção contra abuso, cabeçalhos de segurança, validação/sanitização de entradas, autenticação e auditoria. Não vazar PII ou tokens.

## Critérios de aceite (executar e relatar)

1. O site inicializa localmente com um comando documentado; banco sobe via Docker e migrations aplicam sem erros.
2. Landing desktop/mobile corresponde à intenção dos mockups; sem texto sobreposto/cortado em 360px e 390px; CTA visível na primeira dobra móvel.
3. Progresso inicial 0 de 2500, e após pagamento aprovado de R$ 25 mostra R$ 25 arrecadados e R$ 2.475 restantes; pendente não conta; estorno reverte a soma.
4. Ninguém confirma pagamento sem validação do gateway; callbacks duplicados não duplicam arrecadação.
5. CPF com máscara e validação real, privacidade; nenhuma página pública expõe CPF completo.
6. O Pix Copia e Cola funciona no botão copiar; o QR vem da integração quando credenciais estiverem presentes.
7. Admin exige autenticação; não retorna dados privados na API pública.
8. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` passam, ou explicar impedimentos ambientais exatos com código pronto.
9. README explica como obter credenciais, configurar webhook HTTPS e executar validação de sandbox do Mercado Pago; nunca alegar teste de transação real sem confirmação.
10. Código organizado, comentários apenas onde úteis, sem valores secretos hardcoded.

## Ordem de execução

1. Inspecione os arquivos de referência e a pasta/repositório existente.
2. Inicialize projeto se não existir, com arquitetura acima e design fiel.
3. Implemente páginas e fluxo de pagamento com tratamento de erros realista.
4. Implemente banco, migrations, webhook, painel, segurança e testes.
5. Execute validações; corrija falhas; produza screenshots Playwright mobile e desktop se navegador disponível.
6. Ao finalizar, entregue resumo de arquivos alterados, comandos de rodar, variáveis a preencher e pendências para produção.

Não encerre com uma proposta genérica: escreva o código e execute o máximo possível.
