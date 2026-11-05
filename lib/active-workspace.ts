import { cookies } from "next/headers";
import { getBaseUrl } from "@/lib/env";

/**
 * Which of a user's workspaces the dashboard is showing. Only a preference:
 * getWorkspaceMembership() checks it against the user's memberships on every
 * request, so a stale or forged value falls back to their oldest workspace.
 */
export const ACTIVE_WORKSPACE_COOKIE = "openreply-workspace";

export async function readActiveWorkspaceId(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
}

export function getActiveWorkspaceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    secure: getBaseUrl().startsWith("https://"),
  };
}
