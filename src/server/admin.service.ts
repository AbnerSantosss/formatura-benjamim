import 'server-only';
import type { AdminRole, Gateway, OrderMode, OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { formatNumber, TOTAL_NUMBERS } from '@/domain/orders';
import { audit } from '@/server/audit';
import { prisma } from '@/server/db';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '@/server/errors';
import { getCampaignSummary, type CampaignSummary } from '@/server/orders.service';

// Serviço do painel (`/api/admin/**`). Regras deste arquivo:
// - CPF só sai mascarado (`***.***.***-` + últimos 4 dígitos); `cpfCipher` nunca é lido aqui;
// - nada de `rawCreate`, `passwordHash` ou `tokenHash` nos retornos;
// - datas saem como `Date` (ISO UTC no JSON); só o CSV, que é aberto direto em planilha, sai em horário de Fortaleza;
// - status de pedido não é alterado aqui: estorno é `markRefunded` (orders.service), chamado pela rota.

const CAMPAIGN_ID = 'main';
const TIME_ZONE = 'America/Fortaleza';
const DAY_MS = 24 * 60 * 60 * 1000;
const INT4_MAX = 2_147_483_647;

export const ORDER_PAGE_SIZE = 20;

const ORDER_STATUSES = ['PENDING', 'APPROVED', 'EXPIRED', 'REFUNDED', 'CANCELED'] as const;
const ORDER_MODES = ['NUMBERS', 'EXTRA'] as const;

export const maskCpf = (cpfLast4: string) => '***.***.***-' + cpfLast4;

// --- Pedidos ---------------------------------------------------------------------------------

/** Texto vazio (ex.: `?status=`) conta como filtro ausente. */
const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === 'string' && value.trim() === '') ? undefined : value;

const orderFiltersSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  status: z.preprocess(blankToUndefined, z.enum(ORDER_STATUSES, { error: 'Status inválido.' }).optional()),
  mode: z.preprocess(blankToUndefined, z.enum(ORDER_MODES, { error: 'Modalidade inválida.' }).optional()),
  page: z.preprocess(
    blankToUndefined,
    z.coerce.number({ error: 'Página inválida.' }).int().min(1).max(100_000).default(1),
  ),
  pageSize: z.preprocess(
    blankToUndefined,
    z.coerce.number({ error: 'Tamanho de página inválido.' }).int().min(1).max(100).default(ORDER_PAGE_SIZE),
  ),
});

export type OrderFilters = {
  q?: string | null;
  status?: OrderStatus | string | null;
  mode?: OrderMode | string | null;
};
export type OrderListInput = OrderFilters & {
  page?: number | string | null;
  pageSize?: number | string | null;
};

/** Filtros de pedidos a partir da query string (`?q&status&mode&page&pageSize`). */
export function orderFiltersFromSearch(params: URLSearchParams): OrderListInput {
  return {
    q: params.get('q'),
    status: params.get('status'),
    mode: params.get('mode'),
    page: params.get('page'),
    pageSize: params.get('pageSize'),
  };
}

/**
 * Busca livre: nome, e-mail, últimos 4 dígitos do CPF, id do pedido, número exato da rifa
 * e valor (centavos inteiros, ou reais com vírgula: `12,50`).
 */
function searchConditions(q: string): Prisma.OrderWhereInput[] {
  const or: Prisma.OrderWhereInput[] = [
    { contributor: { name: { contains: q, mode: 'insensitive' } } },
    { contributor: { email: { contains: q, mode: 'insensitive' } } },
    { id: q },
  ];
  if (/^\d{4}$/.test(q)) or.push({ contributor: { cpfLast4: q } });
  if (/^\d{1,10}$/.test(q)) {
    const value = Number(q);
    if (value >= 1 && value <= TOTAL_NUMBERS) or.push({ numbers: { some: { number: value } } });
    if (value <= INT4_MAX) or.push({ amountCents: value });
  }
  const reais = /^(?:R\$\s*)?(\d{1,7})[.,](\d{2})$/i.exec(q);
  if (reais) or.push({ amountCents: Number(reais[1]) * 100 + Number(reais[2]) });
  return or;
}

/** Pendente vencido que ainda não foi varrido conta como EXPIRED, como no resumo da campanha. */
function ordersWhere(
  filters: { q?: string; status?: OrderStatus; mode?: OrderMode },
  now: Date,
): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (filters.status === 'PENDING') and.push({ status: 'PENDING', expiresAt: { gt: now } });
  else if (filters.status === 'EXPIRED') {
    and.push({ OR: [{ status: 'EXPIRED' }, { status: 'PENDING', expiresAt: { lte: now } }] });
  } else if (filters.status) and.push({ status: filters.status });
  if (filters.mode) and.push({ mode: filters.mode });
  if (filters.q) and.push({ OR: searchConditions(filters.q) });
  return and.length > 0 ? { AND: and } : {};
}

const orderInclude = {
  product: { select: { id: true, title: true } },
  contributor: { select: { name: true, email: true, phone: true, cpfLast4: true } },
  numbers: { select: { number: true, active: true }, orderBy: { number: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export type AdminOrder = {
  id: string;
  /** Token do link público (`/pagamento/[id]?t=` e `/obrigado/[id]?t=`). */
  publicToken: string;
  status: OrderStatus;
  mode: OrderMode;
  amountCents: number;
  gateway: Gateway;
  createdAt: Date;
  expiresAt: Date;
  approvedAt: Date | null;
  refundedAt: Date | null;
  product: { id: string; title: string };
  contributor: { name: string; email: string; phone: string; cpfMasked: string };
  /** Todos os números do pedido, em ordem crescente. */
  numbers: number[];
  /** `true` quando os números já voltaram para a grade (pedido expirado, cancelado ou estornado). */
  numbersReleased: boolean;
};

function effectiveStatus(order: { status: OrderStatus; expiresAt: Date }, now: Date): OrderStatus {
  return order.status === 'PENDING' && order.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : order.status;
}

function toAdminOrder(row: OrderRow, now: Date): AdminOrder {
  return {
    id: row.id,
    publicToken: row.publicToken,
    status: effectiveStatus(row, now),
    mode: row.mode,
    amountCents: row.amountCents,
    gateway: row.gateway,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt,
    refundedAt: row.refundedAt,
    product: row.product,
    contributor: {
      name: row.contributor.name,
      email: row.contributor.email,
      phone: row.contributor.phone,
      cpfMasked: maskCpf(row.contributor.cpfLast4),
    },
    numbers: row.numbers.map((n) => n.number),
    numbersReleased: row.numbers.length > 0 && row.numbers.every((n) => !n.active),
  };
}

export type OrderList = { items: AdminOrder[]; page: number; pageSize: number; total: number };

export async function listOrders(input: OrderListInput = {}, now: Date = new Date()): Promise<OrderList> {
  const { page, pageSize, ...filters } = orderFiltersSchema.parse(input);
  const where = ordersWhere(filters, now);
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map((row) => toAdminOrder(row, now)), page, pageSize, total };
}

export type AdminOrderDetail = AdminOrder & {
  /** Cobrança mais recente, sem a resposta crua do provedor. */
  payment: {
    id: string;
    gateway: Gateway;
    status: string;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    ticketUrl: string | null;
    lastCheckedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  audit: {
    id: string;
    action: string;
    actorId: string | null;
    actorName: string | null;
    meta: unknown;
    createdAt: Date;
  }[];
};

export async function getOrder(id: string, now: Date = new Date()): Promise<AdminOrderDetail> {
  const row = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!row) throw new NotFoundError('Pedido não encontrado.');

  const [payment, logs] = await Promise.all([
    prisma.payment.findFirst({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        gateway: true,
        status: true,
        providerOrderId: true,
        providerPaymentId: true,
        ticketUrl: true,
        lastCheckedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { target: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, action: true, actorId: true, meta: true, createdAt: true },
    }),
  ]);

  const actorIds = [...new Set(logs.map((log) => log.actorId).filter((actor): actor is string => !!actor))];
  const actors = actorIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]));

  return {
    ...toAdminOrder(row, now),
    payment,
    audit: logs.map((log) => ({
      ...log,
      actorName: log.actorId ? (actorName.get(log.actorId) ?? null) : null,
    })),
  };
}

// --- Métricas --------------------------------------------------------------------------------

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Dia do calendário de Fortaleza (`AAAA-MM-DD`). */
const dayKey = (date: Date) => dayKeyFormat.format(date);

export type DayMetrics = {
  /** Dia no calendário de Fortaleza, `AAAA-MM-DD`. */
  date: string;
  /** Pedidos criados no dia (qualquer status). */
  createdCount: number;
  /** Pedidos aprovados no dia que continuam aprovados (estornados não entram). */
  approvedCount: number;
  approvedCents: number;
};

export type AdminMetrics = CampaignSummary & {
  costsCents: number;
  totalNumbers: number;
  /** Total de pedidos, em qualquer status. */
  ordersTotal: number;
  /** Hoje e os 6 dias anteriores, do mais antigo para o mais recente. */
  last7Days: DayMetrics[];
};

export async function metrics(now: Date = new Date()): Promise<AdminMetrics> {
  const summary = await getCampaignSummary(now);
  // Fortaleza não tem horário de verão: 24 h atrás é sempre o dia anterior do calendário local.
  const days = Array.from({ length: 7 }, (_, index) =>
    dayKey(new Date(now.getTime() - (6 - index) * DAY_MS)),
  );
  const since = new Date(now.getTime() - 7 * DAY_MS);

  const [campaign, recent] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: CAMPAIGN_ID },
      select: { costsCents: true, totalNumbers: true },
    }),
    prisma.order.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { approvedAt: { gte: since } }] },
      select: { createdAt: true, approvedAt: true, status: true, amountCents: true },
    }),
  ]);

  const byDay = new Map<string, DayMetrics>(
    days.map((date) => [date, { date, createdCount: 0, approvedCount: 0, approvedCents: 0 }]),
  );
  for (const order of recent) {
    const created = byDay.get(dayKey(order.createdAt));
    if (created) created.createdCount += 1;
    if (order.status === 'APPROVED' && order.approvedAt) {
      const approved = byDay.get(dayKey(order.approvedAt));
      if (approved) {
        approved.approvedCount += 1;
        approved.approvedCents += order.amountCents;
      }
    }
  }

  return {
    ...summary,
    costsCents: campaign?.costsCents ?? 0,
    totalNumbers: campaign?.totalNumbers ?? TOTAL_NUMBERS,
    ordersTotal: Object.values(summary.ordersCount).reduce((sum, count) => sum + count, 0),
    last7Days: days.map((date) => byDay.get(date)!),
  };
}

// --- CSV -------------------------------------------------------------------------------------

const CSV_COLUMNS = [
  'id',
  'data',
  'nome',
  'e-mail',
  'telefone',
  'cpf_mascarado',
  'produto',
  'modo',
  'valor',
  'status',
  'numeros',
] as const;
const CSV_SEPARATOR = ';';
const CSV_BATCH = 500;

const csvDateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** `85999990000` → `(85) 99999-0000`: legível e sem 10 ou 11 dígitos seguidos na planilha. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return digits;
  const local = digits.slice(2);
  return `(${digits.slice(0, 2)}) ${local.slice(0, local.length - 4)}-${local.slice(-4)}`;
}

/** Reais com vírgula decimal, sem separador de milhar (`1250` → `12,50`). */
function formatReais(cents: number): string {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

function csvCell(value: string): string {
  // Texto digitado pelo contribuinte que começa com =, +, - ou @ seria lido como fórmula pela planilha.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * CSV dos pedidos com os mesmos filtros da listagem. Separador `;` e valores em reais com vírgula
 * (formato que o Excel em português abre direto); datas no horário de Fortaleza.
 * O CPF sai só mascarado. O BOM é acrescentado pela rota.
 */
export async function exportOrdersCsv(filters: OrderFilters = {}, now: Date = new Date()): Promise<string> {
  const parsed = orderFiltersSchema.parse(filters);
  const where = ordersWhere(parsed, now);
  const lines: string[] = [CSV_COLUMNS.join(CSV_SEPARATOR)];

  for (let skip = 0; ; skip += CSV_BATCH) {
    const rows = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: CSV_BATCH,
    });
    for (const row of rows) {
      const order = toAdminOrder(row, now);
      lines.push(
        [
          order.id,
          csvDateFormat.format(order.createdAt).replace(',', ''),
          order.contributor.name,
          order.contributor.email,
          formatPhone(order.contributor.phone),
          order.contributor.cpfMasked,
          order.product.title,
          order.mode,
          formatReais(order.amountCents),
          order.status,
          order.numbers.map(formatNumber).join(' '),
        ]
          .map(csvCell)
          .join(CSV_SEPARATOR),
      );
    }
    if (rows.length < CSV_BATCH) break;
  }
  return lines.join('\r\n') + '\r\n';
}

// --- Produtos --------------------------------------------------------------------------------

export type AdminProduct = {
  id: string;
  title: string;
  description: string;
  mode: OrderMode;
  unitCents: number | null;
  active: boolean;
  sortOrder: number;
  ordersCount: number;
  approvedCount: number;
  approvedCents: number;
  /** Números ativos de pedidos aprovados deste produto. */
  numbersConfirmed: number;
};

export async function listProducts(): Promise<AdminProduct[]> {
  const [products, byStatus, confirmed] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.order.groupBy({
      by: ['productId', 'status'],
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.orderNumber.findMany({
      where: { active: true, order: { status: 'APPROVED' } },
      select: { order: { select: { productId: true } } },
    }),
  ]);

  const numbersByProduct = new Map<string, number>();
  for (const row of confirmed) {
    numbersByProduct.set(row.order.productId, (numbersByProduct.get(row.order.productId) ?? 0) + 1);
  }

  return products.map((product) => {
    const rows = byStatus.filter((row) => row.productId === product.id);
    const approved = rows.find((row) => row.status === 'APPROVED');
    return {
      ...product,
      ordersCount: rows.reduce((sum, row) => sum + row._count._all, 0),
      approvedCount: approved?._count._all ?? 0,
      approvedCents: approved?._sum.amountCents ?? 0,
      numbersConfirmed: numbersByProduct.get(product.id) ?? 0,
    };
  });
}

const productUpdateSchema = z
  .object({
    title: z.string().trim().min(1, { error: 'Informe o título.' }).max(120),
    description: z.string().trim().min(1, { error: 'Informe a descrição.' }).max(1000),
    active: z.boolean({ error: 'Informe se o produto está ativo.' }),
    unitCents: z
      .number({ error: 'Informe o preço em centavos.' })
      .int({ error: 'O preço deve ser um número inteiro de centavos.' })
      .min(0)
      .max(10_000_000),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'Nada para alterar.',
  });

/**
 * Edita título, descrição e ativo. O preço (`unitCents`) só muda enquanto o produto não tem pedido
 * aprovado. Atenção (ADR 010): a regra de preço da compra usa a constante do domínio; este campo
 * é o que vai para o gateway e para o painel.
 */
export async function updateProduct(id: string, input: unknown, actorId: string): Promise<AdminProduct> {
  const data = productUpdateSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError('Produto não encontrado.');

    if (data.unitCents !== undefined && data.unitCents !== product.unitCents) {
      if (product.mode === 'EXTRA' && data.unitCents !== 0) {
        throw new ValidationError('Produto de valor livre não tem preço unitário.');
      }
      const approved = await tx.order.count({ where: { productId: id, status: 'APPROVED' } });
      if (approved > 0) {
        throw new AppError(
          'PRODUCT_PRICE_LOCKED',
          'O preço não pode mudar: este produto já tem pedido aprovado.',
          409,
        );
      }
    }

    await tx.product.update({ where: { id }, data });
    const fields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    await audit('product.updated', { actorId, meta: { productId: id, fields } }, tx);
  });

  const updated = (await listProducts()).find((product) => product.id === id);
  if (!updated) throw new NotFoundError('Produto não encontrado.');
  return updated;
}

// --- Configurações ---------------------------------------------------------------------------

export type AdminSettings = {
  title: string;
  goalCents: number;
  costsCents: number;
  totalNumbers: number;
  numberUnitCents: number;
  reservationMin: number;
  drawAt: Date | null;
  drawPublic: boolean;
  instagramFather: string;
  instagramMother: string;
  publicMessage: string;
  updatedAt: Date;
};

const centsSchema = z
  .number({ error: 'Informe o valor em centavos.' })
  .int({ error: 'O valor deve ser um número inteiro de centavos.' })
  .min(0, { error: 'O valor não pode ser negativo.' })
  .max(INT4_MAX);

/** Vazio = sem link (ADR 009). Só http(s): o endereço vira link na landing. */
const instagramSchema = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .max(200)
    .pipe(z.url({ protocol: /^https?$/, error: 'Informe o endereço completo do Instagram (https://...).' })),
]);

const settingsSchema = z
  .object({
    goalCents: centsSchema,
    costsCents: centsSchema,
    drawAt: z.union([
      z.null(),
      z.iso
        .datetime({ offset: true, error: 'Data do sorteio inválida.' })
        .transform((value) => new Date(value)),
    ]),
    drawPublic: z.boolean({ error: 'Valor inválido para exibir o resultado.' }),
    instagramFather: instagramSchema,
    instagramMother: instagramSchema,
    publicMessage: z.string().trim().max(500, { error: 'A mensagem pública tem no máximo 500 caracteres.' }),
  })
  .partial();

export async function getSettings(): Promise<AdminSettings> {
  const campaign = await prisma.campaign.findUnique({ where: { id: CAMPAIGN_ID } });
  if (!campaign) throw new NotFoundError('Campanha não configurada.');
  // Sem o `id`: o resto da linha é exatamente o que o painel mostra.
  const { id, activeGateway, ...settings } = campaign;
  void id;
  void activeGateway;
  return settings;
}

export async function updateSettings(input: unknown, actorId: string): Promise<AdminSettings> {
  const data = settingsSchema.parse(input);
  const fields = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (fields.length === 0) throw new ValidationError('Nada para alterar.');

  await prisma.$transaction(async (tx) => {
    const existing = await tx.campaign.findUnique({ where: { id: CAMPAIGN_ID }, select: { id: true } });
    if (!existing) throw new NotFoundError('Campanha não configurada.');
    await tx.campaign.update({ where: { id: CAMPAIGN_ID }, data });
    await audit('settings.updated', { actorId, meta: { fields } }, tx);
  });
  return getSettings();
}

// --- Usuários do painel ----------------------------------------------------------------------

export type AdminListItem = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  /** `invited` = convite ainda não aceito; `disabled` = acesso desativado. */
  status: 'invited' | 'active' | 'disabled';
  invitedAt: Date | null;
  acceptedAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
};

export async function listAdmins(): Promise<AdminListItem[]> {
  const rows = await prisma.adminUser.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      invitedAt: true,
      acceptedAt: true,
      disabledAt: true,
      createdAt: true,
      passwordHash: true,
    },
  });
  return rows.map(({ passwordHash, ...admin }) => ({
    ...admin,
    status: admin.disabledAt ? 'disabled' : passwordHash === null ? 'invited' : 'active',
  }));
}

async function adminListItem(id: string): Promise<AdminListItem> {
  const found = (await listAdmins()).find((admin) => admin.id === id);
  if (!found) throw new NotFoundError('Usuário não encontrado.');
  return found;
}

export type AdminActor = { id: string; role: AdminRole };

/**
 * Desativa o acesso de um admin e encerra suas sessões e links pendentes. Só OWNER;
 * ninguém desativa a si mesmo, e o último OWNER ativo não pode ser desativado.
 */
export async function deactivateAdmin(id: string, by: AdminActor): Promise<AdminListItem> {
  if (by.role !== 'OWNER') throw new ForbiddenError('Só o responsável principal pode desativar usuários.');
  if (id === by.id) {
    throw new AppError('CANNOT_DEACTIVATE_SELF', 'Você não pode desativar o próprio acesso.', 409);
  }

  await prisma.$transaction(async (tx) => {
    // Trava os OWNERs: duas desativações simultâneas não podem deixar o painel sem nenhum.
    await tx.$queryRaw`SELECT "id" FROM "AdminUser" WHERE "role" = 'OWNER' FOR UPDATE`;
    const target = await tx.adminUser.findUnique({ where: { id } });
    if (!target) throw new NotFoundError('Usuário não encontrado.');
    if (target.disabledAt) return;

    if (target.role === 'OWNER') {
      const otherActiveOwners = await tx.adminUser.count({
        where: { role: 'OWNER', disabledAt: null, passwordHash: { not: null }, id: { not: id } },
      });
      if (otherActiveOwners === 0) {
        throw new AppError('LAST_OWNER', 'Não é possível desativar o último responsável ativo.', 409);
      }
    }

    await tx.adminUser.update({ where: { id }, data: { disabledAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.authToken.deleteMany({ where: { userId: id } });
    await audit('admin.deactivated', { actorId: by.id, meta: { adminId: id, role: target.role } }, tx);
  });
  return adminListItem(id);
}

/** Devolve o acesso a um admin desativado. Só OWNER. */
export async function reactivateAdmin(id: string, by: AdminActor): Promise<AdminListItem> {
  if (by.role !== 'OWNER') throw new ForbiddenError('Só o responsável principal pode reativar usuários.');

  await prisma.$transaction(async (tx) => {
    const target = await tx.adminUser.findUnique({ where: { id } });
    if (!target) throw new NotFoundError('Usuário não encontrado.');
    if (!target.disabledAt) return;
    await tx.adminUser.update({ where: { id }, data: { disabledAt: null } });
    await audit('admin.reactivated', { actorId: by.id, meta: { adminId: id, role: target.role } }, tx);
  });
  return adminListItem(id);
}
