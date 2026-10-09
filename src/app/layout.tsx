import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource-variable/nunito';
import '@fontsource/caveat/600.css';
import './globals.css';
import './demo.css';
import './order-flow.css';

export const metadata: Metadata = {
  title: 'Um pequeno formando, um grande sonho · Benjamim',
  description: 'Uma iniciativa da família para celebrar a formatura do ABC do Benjamim.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" data-scroll-behavior="smooth"><body><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><div className="demo-banner">DEMONSTRAÇÃO · Nenhum pagamento real é realizado <Link href="/admin/">Backoffice</Link></div>{children}</body></html>;
}
