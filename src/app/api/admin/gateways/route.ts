import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { getGatewaySettings, updateGatewaySettings } from '@/server/gateways/settings.service';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

// Configuração dos gateways (ADR 015). Só o dono: aqui entram credenciais de pagamento.
// A resposta nunca traz o valor de um segredo, só se o campo está preenchido e de onde vem.
export async function GET() {
  try {
    await requireAdmin({ role: 'OWNER' });
    return json({ gateways: await getGatewaySettings() });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { admin } = await requireAdmin({ role: 'OWNER' });
    assertSameOrigin(req);
    return json({ gateways: await updateGatewaySettings(await readJson(req), admin.id) });
  } catch (error) {
    return fail(error);
  }
}
