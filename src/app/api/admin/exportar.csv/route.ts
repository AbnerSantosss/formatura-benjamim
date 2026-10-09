import { exportOrdersCsv, orderFiltersFromSearch } from '@/server/admin.service';
import { audit } from '@/server/audit';
import { requireAdmin } from '@/server/auth/require-admin';
import { fail } from '@/server/http';

export const dynamic = 'force-dynamic';

/** BOM UTF-8: sem ele o Excel abre os acentos trocados. */
const BOM = '﻿';

// GET /api/admin/exportar.csv?q&status&mode — mesmos filtros da listagem de pedidos.
export async function GET(req: Request) {
  try {
    const { admin } = await requireAdmin();
    const { q, status, mode } = orderFiltersFromSearch(new URL(req.url).searchParams);
    const csv = await exportOrdersCsv({ q, status, mode }, new Date());
    // O arquivo leva dados pessoais para fora do painel: fica registrado quem exportou.
    await audit('orders.exported', {
      actorId: admin.id,
      meta: { filtered: Boolean(q || status || mode) },
    });
    return new Response(BOM + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pedidos.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
