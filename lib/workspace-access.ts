import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { readActiveWorkspaceId } from "@/lib/active-workspace";
import { ensureWorkspaceForUser, getWorkspaceMembership } from "@/lib/workspace";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspace: Workspace;
  role: WorkspaceRole;
};

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasWorkspaceRole(
  role: WorkspaceRole,
  minimumRole: WorkspaceRole
) {
  return ROLE_ORDER[role] >= ROLE_ORDER[minimumRole];
}

export function canManageWorkspace(role: WorkspaceRole) {
  return hasWorkspaceRole(role, "ADMIN");
}

/**
 * Only an admin or owner who connected one of the workspace's Instagram
 * accounts can send or revoke invites. The role check stays so a connector
 * who was later demoted to member cannot invite new admins.
 */
export async function canInviteMembers(
  context: Pick<WorkspaceContext, "userId" | "workspaceId" | "role">
): Promise<boolean> {
  if (!canManageWorkspace(context.role)) return false;
  const connected = await prisma.instagramAccount.count({
    where: { workspaceId: context.workspaceId, connectedByUserId: context.userId },
  });
  return connected > 0;
}

export function canManageBilling(role: WorkspaceRole) {
  return role === "OWNER";
}

export async function getCurrentWorkspaceContext(): Promise<WorkspaceContext | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const preferredWorkspaceId = await readActiveWorkspaceId();
  const membership = await getWorkspaceMembership(userId, preferredWorkspaceId);

  if (membership) {
    return {
      userId,
      workspaceId: membership.workspace.id,
      workspace: membership.workspace,
      role: membership.role,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  // Null on an invite-only instance for a user nobody invited, which every
  // caller already answers with 401.
  const workspace = await ensureWorkspaceForUser(userId, user?.email);
  if (!workspace) return null;

  const createdMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId,
      },
    },
  });

  return {
    userId,
    workspaceId: workspace.id,
    workspace,
    role: createdMembership?.role ?? "OWNER",
  };
}
