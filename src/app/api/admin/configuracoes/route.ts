import { getSettings, updateSettings } from '@/server/admin.service';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireAdmin } from '@/server/auth/require-admin';
import { gatewayHealth } from '@/server/gateways/registry';
import { fail, json, readJson } from '@/server/http';

export const dynamic = 'force-dynamic';

// `gateways` traz só o estado (qual está ativo e se há credenciais), nunca valores de chave.
export async function GET() {
  try {
    await requireAdmin();
    return json({ settings: await getSettings(), gateways: gatewayHealth() });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { admin } = await requireAdmin();
    assertSameOrigin(req);
    const settings = await updateSettings(await readJson(req), admin.id);
    return json({ settings, gateways: gatewayHealth() });
  } catch (error) {
    return fail(error);
  }
}
