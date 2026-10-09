import type { NextConfig } from 'next';

// Cabeçalhos de segurança (T22). Resultado da revisão em wiki/operacao/seguranca.md.
//
// CSP sem nonce: as páginas públicas são estáticas ou guardadas em cache, e nonce obrigaria a
// renderizar tudo a cada requisição. Por isso `script-src` e `style-src` levam 'unsafe-inline'
// (o Next injeta scripts e estilos inline). 'unsafe-eval' só entra fora de produção: o React usa
// `eval` em desenvolvimento para reconstruir pilhas de erro.
function contentSecurityPolicy(isProduction: boolean): string {
  return [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// Páginas e respostas que carregam dado de uma pessoa ou do painel: fora de buscadores e de caches.
const PRIVATE_SOURCES = ['/admin/:path*', '/pagamento/:path*', '/obrigado/:path*', '/api/:path*'];

const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  trailingSlash: false,
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/(.*)',
        headers: [
          // Só tem efeito em HTTPS; em http://127.0.0.1 o navegador ignora.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy(isProduction) },
        ],
      },
      ...PRIVATE_SOURCES.map((source) => ({
        source,
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          // As rotas de API já respondem `no-store` por conta própria (`json()` em src/server/http.ts).
          { key: 'Cache-Control', value: 'no-store' },
        ],
      })),
    ];
  },
};
export default nextConfig;
