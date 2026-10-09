import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from '@/proxy';

// Domínio fictício: o NextRequest normaliza 127.0.0.1 para localhost, o que confundiria a comparação.
const ORIGIN = 'https://benjamim.exemplo.invalid';

function visit(path: string, cookie?: string) {
  const request = new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
  return proxy(request);
}

/** Destino do redirecionamento, ou `null` quando a requisição segue adiante. */
function redirectOf(path: string, cookie?: string): string | null {
  return visit(path, cookie).headers.get('location');
}

describe('proxy do painel', () => {
  it('rota protegida sem cookie de sessão vai para o login guardando o destino', () => {
    const response = visit('/admin/trocar-senha');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/admin?next=%2Fadmin%2Ftrocar-senha`);
    expect(redirectOf('/admin/qualquer/coisa')).toBe(`${ORIGIN}/admin?next=%2Fadmin%2Fqualquer%2Fcoisa`);
  });

  it('com o cookie presente a requisição segue (a validação de verdade é no servidor)', () => {
    expect(redirectOf('/admin/trocar-senha', 'bj_admin=qualquer-valor')).toBeNull();
  });

  it('outro cookie não conta como sessão', () => {
    expect(redirectOf('/admin/trocar-senha', 'outro=1')).toBe(`${ORIGIN}/admin?next=%2Fadmin%2Ftrocar-senha`);
  });

  it('o login e as telas de convite e de senha esquecida são públicas', () => {
    for (const path of [
      '/admin',
      '/admin/esqueci-senha',
      '/admin/redefinir/token-qualquer',
      '/admin/convite/token-qualquer',
    ]) {
      expect(redirectOf(path), path).toBeNull();
    }
  });

  it('só atua em /admin', () => {
    expect(config.matcher).toEqual(['/admin/:path*']);
    expect(redirectOf('/')).toBeNull();
    expect(redirectOf('/contribuir')).toBeNull();
  });
});
