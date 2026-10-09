# Guia para o Abner: como usar o painel da campanha

Este guia explica, passo a passo, como usar o painel do site do Benjamim. Você não precisa saber programar para seguir.

## Antes de tudo

- O site tem duas partes. A **página pública** é a que as pessoas veem para contribuir. O **painel** é a área restrita, onde você acompanha a campanha. Para abrir o painel, escreva o endereço do site e acrescente `/admin` no final.
- Só entre no painel no seu computador ou celular. Não deixe a senha salva em computador de outras pessoas.
- **Nunca envie senhas, chaves ou o arquivo `.env` por WhatsApp, e-mail ou mensagem.** Esses dados ficam guardados no servidor e no seu gerenciador de senhas.
- Os exemplos de e-mail abaixo são fictícios, como `voce@exemplo.com`.

## 1. Entrar no painel pela primeira vez

1. Abra o endereço do site e acrescente `/admin`.
2. Digite seu e-mail e a senha temporária que foi definida para você.
3. O sistema vai pedir para trocar a senha. Escolha uma senha nova, com pelo menos 10 caracteres, com letras e números.
4. Clique em **Salvar e continuar**.
5. Guarde a nova senha no seu gerenciador de senhas.

Esqueceu a senha? Na tela de entrada, clique em **Esqueci minha senha**. Você vai receber um e-mail com um link para criar outra.

O seu acesso é criado uma vez, pelo comando `npm run admin:create`, feito por quem configura o sistema. Você não precisa repetir isso depois.

## 2. Convidar alguém para ajudar

Use isso se quiser que outra pessoa da família cuide do painel.

1. No menu, clique em **Usuários**.
2. Preencha **Nome**, **E-mail** e **Papel**. Você pode escolher **Administrador** ou **Proprietário**. Só um Proprietário consegue criar outro Proprietário.
3. Clique em **Convidar**. A pessoa recebe um e-mail com um link para criar a senha dela.
4. Se o e-mail não chegar, procure a pessoa na lista e clique em **Reenviar convite**. Esse botão aparece enquanto o convite não foi aceito.
5. Para tirar o acesso de alguém, use a opção de desativar. O sistema pede confirmação. O acesso pode ser reativado depois por um Proprietário.

## 3. Ver os pedidos

1. No menu, clique em **Pedidos**. Cada linha é uma contribuição, com nome, valor, data e situação.
2. Para encontrar alguém, use o campo **Buscar pedido**.
3. Para filtrar, use **Filtrar modalidade** e o filtro de situação.

As situações são:

- **Pendente**: a pessoa ainda não pagou, ou o Pix ainda não foi confirmado.
- **Aprovado**: o pagamento foi confirmado. Só esses pedidos participam do sorteio.
- **Expirado**: o Pix venceu sem pagamento. Os números foram liberados.
- **Estornado**: o valor foi devolvido. Os números foram liberados.
- **Cancelado**: o pedido foi cancelado antes do pagamento.

## 4. Estornar um pedido

Use isso quando alguém pedir a devolução do valor.

1. Em **Pedidos**, encontre o pedido. O botão **Estornar** só aparece em pedidos **Aprovados**.
2. Clique em **Estornar** e leia a pergunta de confirmação.
3. Clique em **Sim, estornar**.

Depois do estorno, os números do pedido voltam a ficar livres para outras pessoas. Antes de estornar, lembre-se de que um pedido estornado deixa de participar do sorteio. Se o pedido for estornado depois que o ganhador já foi sorteado, o sistema hoje não faz nada sozinho. Combine isso com um técnico antes.

## 5. Exportar a lista em planilha (CSV)

1. Em **Pedidos**, clique em **Exportar CSV**.
2. O arquivo chamado `pedidos.csv` é baixado. Ele abre no Excel ou no Planilhas Google.
3. O arquivo sai com a busca e os filtros que estiverem ativos na tela.

O arquivo tem nome, e-mail e telefone das pessoas. O CPF aparece só com os quatro últimos números. Guarde o arquivo em local seguro e não o envie para ninguém.

## 6. Definir a data do sorteio

1. No menu, clique em **Configurações**.
2. Na área **Sorteio**, escolha a data e a hora em **Data e hora do sorteio**. O horário é o de Fortaleza.
3. Clique em **Salvar configurações**.

Se marcar **Exibir o resultado do sorteio na página da campanha**, a página pública mostra o número sorteado e só o primeiro nome do ganhador.

Antes da data marcada, o botão de sorteio fica bloqueado. Só um Proprietário pode sortear antes da data.

## 7. Gerar o ganhador

1. No menu, clique em **Visão geral**. Procure o card **Sorteio**.
2. Quando chegar a data, clique em **Gerar ganhador**.
3. Leia a pergunta **Gerar ganhador?** e clique em **Sim, sortear**.
4. O resultado mostra o número sorteado e os dados de quem comprou esse número.

Como é um sorteio por número, quem comprou mais números tem mais chances. Participam só os números de pedidos **Aprovados**.

Depois do sorteio, o sistema envia um e-mail para o ganhador e outro para os administradores. Tire uma foto da tela com o resultado e guarde como comprovante.

**Anular um sorteio** também é feito pela tela do sorteio, mas só um Proprietário pode fazer isso. É preciso escrever o motivo, e o registro fica guardado.

## 8. Quando um Pix não confirma

Siga esta ordem.

1. **Espere alguns minutos.** Enquanto a pessoa está com a tela do Pix aberta, o sistema consulta o Mercado Pago sozinho. O banco também avisa o sistema quando o pagamento cai.
2. **Veja a situação em Pedidos.** Se continuar **Pendente** e o Pix já venceu, vá em **Configurações**, procure o card **Pedidos vencidos** e clique em **Rodar expiração agora**. O sistema marca como expirados os pedidos vencidos e libera os números. Se nenhum pedido estava vencido, a tela avisa isso.
3. **Se a pessoa diz que pagou, mas o pedido está como Expirado**, o sistema não aprova sozinho. Procure o pagamento no painel do Mercado Pago. Se ele estiver pago, a devolução precisa ser combinada com a pessoa e feita manualmente. Peça ajuda a um técnico antes de decidir.
4. **Não existe botão para aprovar pagamento à mão.** Um pedido só vira **Aprovado** quando o Mercado Pago confirma. Isso protege a campanha de aprovações falsas.

## 9. Backup (cópia de segurança)

Ainda não existe cópia automática configurada. Ela faz parte da colocação do site no ar, que ainda não aconteceu. Quando o site estiver no ar, a cópia deve ser feita todos os dias e guardada fora do servidor. Peça a um técnico para confirmar que isso está funcionando.

Enquanto isso, guarde uma planilha de pedidos feita pelo botão **Exportar CSV**.

## 10. Senhas e chaves

Algumas informações do sistema são segredos. Elas ficam **só** no arquivo de configuração do servidor, chamado `.env`. Nunca ficam no site, nem neste texto, nem no código.

Guarde no seu gerenciador de senhas, pelo menos:

- sua senha de acesso ao painel;
- a chave `CPF_ENCRYPTION_KEY`. **Ela é a mais importante.** Sem ela, os CPFs guardados não podem mais ser lidos. Guarde uma cópia de segurança dela;
- o acesso (token) e a chave de assinatura do Mercado Pago;
- a senha da conta de e-mail que envia as mensagens do sistema;
- o segredo de sessão (`AUTH_SECRET`).

## 11. O que ainda falta antes de cobrar de verdade

Estes pontos dependem de decisões suas ou de um técnico. Não foram resolvidos ainda:

1. Confirmar com um advogado se a forma de arrecadação com números e sorteio está correta.
2. Configurar a conta de produção do Mercado Pago e testar um pagamento real de R$ 5.
3. Decidir o que fazer quando um pagamento chega depois do prazo do Pix.
4. Trocar os textos de demonstração que ainda aparecem na página pública.
5. Colocar o site no ar e configurar a cópia de segurança.

Quando um desses pontos for resolvido, peça para atualizarem este guia.
