import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  ACTIVE_WORKSPACE_COOKIE,
  getActiveWorkspaceCookieOptions,
} from "@/lib/active-workspace";

const switchSchema = z.object({
  workspaceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const parsed = switchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Missing workspace ID" },
      { status: 400 }
    );
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId },
    },
    select: { workspaceId: true },
  });
  if (!membership) {
    return NextResponse.json(
      { success: false, error: "You are not a member of that workspace" },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    ACTIVE_WORKSPACE_COOKIE,
    membership.workspaceId,
    getActiveWorkspaceCookieOptions()
  );
  return response;
}
