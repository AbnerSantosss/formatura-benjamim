import type { Metadata } from 'next';
import '@fontsource-variable/nunito';
import '@fontsource/caveat/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Um pequeno formando, um grande sonho · Benjamim',
  description: 'Uma iniciativa da família para celebrar a formatura do ABC do Benjamim.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" data-scroll-behavior="smooth"><body><a className="skip-link" href="#conteudo">Pular para o conteúdo</a>{children}</body></html>;
}
