import 'server-only';
import type { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { audit } from '@/server/audit';
import { prisma } from '@/server/db';
import { sendEmail } from '@/server/email/send';
import { env } from '@/server/env';
import { AppError, NotFoundError, ValidationError } from '@/server/errors';
import { INVITE_TTL_MS, issueToken } from './tokens';

/**
 * Convite de administradores (wiki/fluxos/autenticacao-admin.md).
 *
 * O token do convite só sai daqui dentro do link do e-mail: nenhuma função devolve o valor
 * em claro, e ele não vai para log nem para a auditoria.
 */

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  role: z.enum(['OWNER', 'ADMIN']),
});

export type InviteInput = { name: string; email: string; role: AdminRole };

/** Quem está convidando: o admin logado (`requireAdmin().admin`). */
export type InviteActor = { id: string; name: string };

export type InviteResult = {
  admin: { id: string; name: string; email: string; role: AdminRole };
  /** `false` quando o envio falhou; o convite continua criado e pode ser reenviado. */
  emailSent: boolean;
};

function alreadyAdmin(): AppError {
  return new AppError('ALREADY_ADMIN', 'Já é administrador.', 409);
}

function disabledAdmin(): AppError {
  return new AppError(
    'ACCOUNT_DISABLED',
    'Este acesso está desativado. Reative o usuário antes de convidar.',
    409,
  );
}

function inviteUrl(raw: string): string {
  return `${env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/admin/convite/${raw}`;
}

export async function inviteAdmin(input: InviteInput, invitedBy: InviteActor): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Informe nome, e-mail e papel válidos.');
  const { name, email, role } = parsed.data;

  const { admin, raw } = await prisma.$transaction(async (tx) => {
    const existing = await tx.adminUser.findUnique({ where: { email } });
    if (existing?.disabledAt) throw disabledAdmin();
    if (existing && existing.passwordHash !== null) throw alreadyAdmin();

    const now = new Date();
    const saved = await tx.adminUser.upsert({
      where: { email },
      create: { email, name, role, invitedAt: now, invitedById: invitedBy.id },
      update: { name, role, invitedAt: now, invitedById: invitedBy.id },
      select: { id: true, name: true, email: true, role: true },
    });
    const token = await issueToken(saved.id, 'INVITE', INVITE_TTL_MS, tx);
    await audit('admin.invited', { actorId: invitedBy.id, meta: { adminId: saved.id, role } }, tx);
    return { admin: saved, raw: token };
  });

  // Depois do commit: falha de e-mail não desfaz o convite (`sendEmail` nunca lança).
  const { ok } = await sendEmail('convite-admin', admin.email, {
    nome: admin.name,
    convidadoPor: invitedBy.name,
    url: inviteUrl(raw),
  });
  return { admin, emailSent: ok };
}

/** Reemite o convite: token novo, o anterior deixa de valer. */
export async function resendInvite(adminId: string, by: InviteActor): Promise<InviteResult> {
  const { admin, raw } = await prisma.$transaction(async (tx) => {
    const existing = await tx.adminUser.findUnique({ where: { id: adminId } });
    if (!existing) throw new NotFoundError('Usuário não encontrado.');
    if (existing.disabledAt) throw disabledAdmin();
    if (existing.passwordHash !== null) throw alreadyAdmin();

    const saved = await tx.adminUser.update({
      where: { id: adminId },
      data: { invitedAt: new Date(), invitedById: by.id },
      select: { id: true, name: true, email: true, role: true },
    });
    const token = await issueToken(saved.id, 'INVITE', INVITE_TTL_MS, tx);
    await audit('admin.invite_resent', { actorId: by.id, meta: { adminId: saved.id } }, tx);
    return { admin: saved, raw: token };
  });

  const { ok } = await sendEmail('convite-admin', admin.email, {
    nome: admin.name,
    convidadoPor: by.name,
    url: inviteUrl(raw),
  });
  return { admin, emailSent: ok };
}
