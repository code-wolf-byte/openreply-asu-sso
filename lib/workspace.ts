import { prisma } from "@/lib/db/client";
import { canCreateOwnWorkspace } from "@/lib/env";
import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";

function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function acceptPendingInvitationsForUser(
  userId: string,
  email?: string | null
): Promise<void> {
  if (!email) return;

  const normalizedEmail = normalizeInviteEmail(email);
  const now = new Date();
  const invitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: normalizedEmail,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });

  for (const invitation of invitations) {
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        },
        update: {
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
        },
      }),
    ]);
  }
}

/**
 * The workspace a user is working in. preferredWorkspaceId comes from the
 * workspace switcher's cookie and is only honored while the user is still a
 * member; otherwise, or without one, it is the oldest membership.
 */
export async function getWorkspaceMembership(
  userId: string,
  preferredWorkspaceId?: string | null
): Promise<{
  workspace: Workspace;
  role: WorkspaceRole;
} | null> {
  const preferred = preferredWorkspaceId
    ? await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: preferredWorkspaceId, userId },
        },
        include: { workspace: true },
      })
    : null;
  const membership =
    preferred ??
    (await prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!membership) return null;

  return {
    workspace: membership.workspace,
    role: membership.role,
  };
}

export async function ensureWorkspaceForUser(
  userId: string,
  email?: string | null,
  preferredWorkspaceId?: string | null
): Promise<Workspace | null> {
  await acceptPendingInvitationsForUser(userId, email);

  const existingMembership = await getWorkspaceMembership(
    userId,
    preferredWorkspaceId
  );
  if (existingMembership) {
    return existingMembership.workspace;
  }

  // Invite-only instances never hand an uninvited user a workspace; callers
  // treat null as "no access".
  if (!canCreateOwnWorkspace(email)) return null;

  const workspaceName = email ? `${email.split("@")[0]}'s workspace` : "My workspace";

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });
}

export async function getPrimaryWorkspace(
  userId: string,
  preferredWorkspaceId?: string | null
): Promise<Workspace | null> {
  const membership = await getWorkspaceMembership(userId, preferredWorkspaceId);
  return membership?.workspace ?? null;
}

export async function listWorkspacesForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });
  return memberships.map(({ role, workspace }) => ({ ...workspace, role }));
}
