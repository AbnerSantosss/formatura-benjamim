import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Header, Footer } from '@/components/shared';
import { prisma } from '@/server/db';

// Renderizada a cada visita: o `next build` (dentro do `docker build`) roda sem banco, então a página
// não pode ser pré-renderizada lendo os links do rodapé. Ver wiki/operacao/deploy.md.
export const dynamic = 'force-dynamic';
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ legal: 'termos' }, { legal: 'privacidade' }, { legal: 'regulamento' }];
}

const CONTATO = 'pelos canais de contato divulgados na página inicial';

const PAGINAS: Record<
  string,
  { titulo: string; intro: string; secoes: { titulo: string; paragrafos: string[] }[] }
> = {
  privacidade: {
    titulo: 'Sua privacidade importa.',
    intro:
      'Explicamos quais dados coletamos, para que servem e como você pode pedir acesso, correção ou exclusão.',
    secoes: [
      {
        titulo: 'Dados que coletamos',
        paragrafos: ['Nome, CPF, telefone (WhatsApp), e-mail, números escolhidos e valor da contribuição.'],
      },
      {
        titulo: 'Para que usamos',
        paragrafos: [
          'Os dados servem para identificar a contribuição, registrar os números, realizar o sorteio e entrar em contato com a pessoa sorteada.',
        ],
      },
      {
        titulo: 'Por quanto tempo guardamos',
        paragrafos: [
          'Mantemos os dados por até 90 dias após o sorteio. Depois desse prazo, eles são anonimizados.',
        ],
      },
      {
        titulo: 'Seus direitos',
        paragrafos: [
          `Você pode pedir acesso, correção ou exclusão dos seus dados. Envie o pedido ${CONTATO}.`,
        ],
      },
      {
        titulo: 'Pagamento',
        paragrafos: [
          'O pagamento é processado pelo Mercado Pago, que trata os dados da transação conforme as políticas dele.',
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
        paragrafos: [`A campanha é organizada pela família do Benjamim. O contato é feito ${CONTATO}.`],
      },
      {
        titulo: 'Como participar',
        paragrafos: [
          'A contribuição é feita em múltiplos de R$ 5, via Pix. Cada R$ 5 dá direito a 10 números, de 0001 a 5000.',
          'Os números ficam reservados por 10 minutos, até a confirmação do pagamento.',
        ],
      },
      {
        titulo: 'Quem pode concorrer',
        paragrafos: ['Só concorrem os números de contribuições confirmadas até o momento do sorteio.'],
      },
      {
        titulo: 'Data do sorteio',
        paragrafos: [
          'A data e a hora do sorteio são divulgadas na página inicial e definidas pelo organizador.',
        ],
      },
      {
        titulo: 'Como o sorteio é feito',
        paragrafos: [
          'O sorteio é eletrônico e aleatório, entre todos os números elegíveis, e o resultado fica registrado. Cada número tem a mesma chance de ser sorteado.',
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
          'O contato é feito pelo e-mail e pelo WhatsApp informados na contribuição. A pessoa sorteada tem 7 dias para responder. Sem resposta nesse prazo, é feito um novo sorteio.',
        ],
      },
      {
        titulo: 'Estornos',
        paragrafos: [
          'Pedidos de estorno são feitos ao organizador. Contribuições estornadas perdem os números.',
        ],
      },
      {
        titulo: 'Dados pessoais',
        paragrafos: [
          'Os dados são usados apenas para esta campanha. O CPF é armazenado de forma cifrada. Veja a política de privacidade.',
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

export default async function Legal({ params }: { params: Promise<{ legal: string }> }) {
  const { legal } = await params;
  const pagina = ['termos', 'privacidade', 'regulamento'].includes(legal) ? PAGINAS[legal] : null;
  if (!pagina) notFound();
  const instagram = await prisma.campaign.findUnique({
    where: { id: 'main' },
    select: { instagramFather: true, instagramMother: true },
  });
  return (
    <>
      <Header checkout />
      <main id="conteudo" className="legal-page container">
        <span className="eyebrow">FORMATURA DO BENJAMIM</span>
        <h1>{pagina.titulo}</h1>
        <p className="legal-intro">{pagina.intro}</p>
        {pagina.secoes.map((secao) => (
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
