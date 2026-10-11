import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Header, Footer } from '@/components/shared';
import { prisma } from '@/server/db';
import { demoModeOn } from '@/server/gateways/registry';

// Renderizada a cada visita: o `next build` (dentro do `docker build`) roda sem banco, então a página
// não pode ser pré-renderizada lendo os links do rodapé. Ver wiki/operacao/deploy.md.
export const dynamic = 'force-dynamic';
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ legal: 'termos' }, { legal: 'privacidade' }, { legal: 'regulamento' }];
}

type Secao = { titulo: string; paragrafos: string[] };
type Pagina = { titulo: string; intro: string; secoes: Secao[] };

// Tudo que está afirmado aqui precisa corresponder ao que o código faz (serviço de pedidos, sorteio,
// e-mails, painel). Ao mudar uma regra no sistema, mude o texto junto.

// Seção extra das três páginas enquanto o modo demonstração está ligado no painel (ADR 016).
const AVISO_DEMONSTRACAO: Secao = {
  titulo: 'Modo de demonstração',
  paragrafos: [
    'O site está em modo de demonstração: nenhum Pix real é gerado, nenhum valor é cobrado e nada é enviado ao provedor de pagamento.',
    'Mesmo assim, os dados digitados no formulário são enviados e guardados como em um pedido real, e o e-mail de confirmação é enviado de verdade.',
  ],
};

/** `contato`: por onde falar com a família (depende de haver perfis cadastrados no painel). */
function paginas(contato: string): Record<string, Pagina> {
  return {
    privacidade: {
      titulo: 'Sua privacidade importa.',
      intro:
        'Explicamos quais dados coletamos, para que servem e como você pode pedir acesso, correção ou exclusão.',
      secoes: [
        {
          titulo: 'Dados que coletamos',
          paragrafos: [
            'Nome, CPF, telefone (WhatsApp) e e-mail informados no formulário, além dos números escolhidos, do valor e da data do pedido.',
            'O CPF é guardado cifrado; só os 4 últimos dígitos ficam legíveis.',
          ],
        },
        {
          titulo: 'Para que usamos',
          paragrafos: [
            'Os dados servem para identificar a contribuição, registrar os números, gerar o Pix, enviar o e-mail de confirmação, realizar o sorteio e entrar em contato com a pessoa sorteada.',
          ],
        },
        {
          titulo: 'Quem tem acesso',
          paragrafos: [
            'Os administradores do painel da campanha (a família e quem ela convidar) veem o nome, o e-mail, o telefone, os 4 últimos dígitos do CPF e os pedidos.',
            'Se o resultado do sorteio for publicado na página inicial, aparecem só o número sorteado e o primeiro nome de quem ganhou.',
          ],
        },
        {
          titulo: 'Por quanto tempo guardamos',
          paragrafos: [
            'Os dados ficam guardados no banco de dados da campanha. Não existe exclusão automática por prazo: eles são apagados pela família, a seu pedido.',
          ],
        },
        {
          titulo: 'Seus direitos',
          paragrafos: [
            `Você pode pedir acesso, correção ou exclusão dos seus dados. Faça o pedido ${contato}.`,
          ],
        },
        {
          titulo: 'Pagamento',
          paragrafos: [
            'O Pix é gerado pelo Mercado Pago, que recebe o nome, o e-mail e o CPF de quem paga e trata os dados da transação conforme as políticas dele.',
            'Guardamos o código do Pix e o registro da cobrança devolvido pelo provedor.',
          ],
        },
      ],
    },
    termos: {
      titulo: 'Sobre esta campanha.',
      intro: 'Regras para usar este site e participar da campanha.',
      secoes: [
        {
          titulo: 'Uso do site',
          paragrafos: [
            'Este site serve para conhecer a campanha e contribuir com a formatura do Benjamim. Use-o de forma pessoal e de boa-fé.',
          ],
        },
        {
          titulo: 'Idade mínima',
          paragrafos: ['Para contribuir, é preciso ter 18 anos ou mais.'],
        },
        {
          titulo: 'Automação proibida',
          paragrafos: [
            'Não é permitido usar robôs, scripts ou qualquer outra automação para reservar números, fazer contribuições ou acessar o site.',
          ],
        },
        {
          titulo: 'Responsabilidade',
          paragrafos: [
            'A família organizadora cuida da campanha, mas não responde por falhas de internet, do aparelho ou do provedor de pagamento, nem pelos atrasos que elas causarem.',
          ],
        },
      ],
    },
    regulamento: {
      titulo: 'Regulamento do sorteio.',
      intro: 'Como funciona a participação, o sorteio e a entrega do prêmio.',
      secoes: [
        {
          titulo: 'Organizador',
          paragrafos: [
            `A campanha é organizada pela família do Benjamim. A escola não organiza a campanha. O contato é feito ${contato}.`,
          ],
        },
        {
          titulo: 'Como participar',
          paragrafos: [
            'A contribuição com números é feita em múltiplos de R$ 5, via Pix. Cada R$ 5 dá direito a 10 números, de 0001 a 5000.',
            'Os números ficam reservados por 10 minutos, até a confirmação do pagamento. Sem pagamento nesse prazo, eles voltam a ficar disponíveis.',
            'A colaboração avulsa tem valor livre a partir de R$ 5, não inclui números e não participa do sorteio.',
          ],
        },
        {
          titulo: 'Quem pode concorrer',
          paragrafos: ['Só concorrem os números de contribuições confirmadas até o momento do sorteio.'],
        },
        {
          titulo: 'Data do sorteio',
          paragrafos: [
            'A data e a hora do sorteio são definidas pelo organizador. Quando já estão definidas, aparecem no e-mail de confirmação da contribuição.',
          ],
        },
        {
          titulo: 'Como o sorteio é feito',
          paragrafos: [
            'O sorteio é eletrônico e aleatório, feito pelo organizador no painel da campanha, entre todos os números elegíveis. Cada número tem a mesma chance de ser sorteado; quem tem mais números tem mais chances.',
            'Ficam registrados a data, a quantidade de números participantes, um código de conferência da lista de participantes e o número sorteado. Só existe um sorteio válido: para refazer, o anterior precisa ser anulado, com o motivo registrado.',
          ],
        },
        {
          titulo: 'Prêmio',
          paragrafos: [
            'O prêmio é o descrito na página inicial. A entrega é combinada diretamente com a pessoa sorteada.',
          ],
        },
        {
          titulo: 'Contato com a pessoa sorteada',
          paragrafos: [
            'A pessoa sorteada recebe um e-mail automático, e o organizador também pode chamar pelo WhatsApp informado na contribuição. Ela tem 7 dias para responder. Sem resposta nesse prazo, o organizador pode anular o sorteio e fazer outro.',
            'O organizador pode publicar na página inicial o número sorteado e o primeiro nome de quem ganhou.',
          ],
        },
        {
          titulo: 'Estornos',
          paragrafos: [
            'Pedidos de estorno são feitos ao organizador. Contribuições estornadas perdem os números, que voltam a ficar disponíveis.',
            'Um Pix pago depois do prazo da reserva não confirma os números; nesse caso, o organizador devolve o valor.',
          ],
        },
        {
          titulo: 'Dados pessoais',
          paragrafos: [
            'Os dados são usados apenas para esta campanha. O CPF é armazenado de forma cifrada, com os 4 últimos dígitos legíveis. Veja a política de privacidade.',
          ],
        },
        {
          titulo: 'Aviso',
          paragrafos: [
            'Esta é uma campanha familiar de arrecadação com sorteio de brinde entre os colaboradores.',
          ],
        },
      ],
    },
  };
}

export default async function Legal({ params }: { params: Promise<{ legal: string }> }) {
  const { legal } = await params;
  if (!['termos', 'privacidade', 'regulamento'].includes(legal)) notFound();
  const [instagram, demo] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: 'main' },
      select: { instagramFather: true, instagramMother: true },
    }),
    demoModeOn(),
  ]);
  // O rodapé desta página só mostra os perfis da família quando estão cadastrados no painel.
  const contato =
    instagram?.instagramFather || instagram?.instagramMother
      ? 'pessoalmente com a família ou pelos perfis dela no rodapé desta página'
      : 'pessoalmente com a família do Benjamim';
  const pagina = paginas(contato)[legal];
  const secoes = demo ? [AVISO_DEMONSTRACAO, ...pagina.secoes] : pagina.secoes;
  return (
    <>
      <Header checkout />
      <main id="conteudo" className="legal-page container">
        <span className="eyebrow">FORMATURA DO BENJAMIM</span>
        <h1>{pagina.titulo}</h1>
        <p className="legal-intro">{pagina.intro}</p>
        {secoes.map((secao) => (
          <Fragment key={secao.titulo}>
            <h2>{secao.titulo}</h2>
            {secao.paragrafos.map((paragrafo) => (
              <p key={paragrafo}>{paragrafo}</p>
            ))}
          </Fragment>
        ))}
        <Link className="button" href="/">
          Voltar à campanha
        </Link>
      </main>
      <Footer
        instagramFather={instagram?.instagramFather ?? ''}
        instagramMother={instagram?.instagramMother ?? ''}
      />
    </>
  );
}
