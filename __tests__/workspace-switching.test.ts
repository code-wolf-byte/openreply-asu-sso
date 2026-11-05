import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockUserId } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    workspaceInvitation: { findMany: vi.fn() },
    workspace: { create: vi.fn() },
  },
  mockUserId: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: mockUserId }));

import { ensureWorkspaceForUser, getWorkspaceMembership } from "../lib/workspace";
import { canCreateOwnWorkspace } from "../lib/env";
import { POST as switchWorkspace } from "../app/api/workspace/active/route";
import { ACTIVE_WORKSPACE_COOKIE } from "../lib/active-workspace";

const PERSONAL = { workspace: { id: "ws_personal", name: "Personal" }, role: "OWNER" };
const TEAM = { workspace: { id: "ws_team", name: "Team" }, role: "MEMBER" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INVITE_ONLY;
  delete process.env.WORKSPACE_CREATOR_EMAILS;
  mockPrisma.workspaceInvitation.findMany.mockResolvedValue([]);
  mockPrisma.workspace.create.mockResolvedValue({ id: "ws_new", name: "new" });
});

afterEach(() => {
  delete process.env.INVITE_ONLY;
  delete process.env.WORKSPACE_CREATOR_EMAILS;
});

describe("getWorkspaceMembership", () => {
  it("uses the preferred workspace when the user is a member", async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(TEAM);
    await expect(getWorkspaceMembership("user_1", "ws_team")).resolves.toMatchObject({
      workspace: { id: "ws_team" },
      role: "MEMBER",
    });
    expect(mockPrisma.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_userId: { workspaceId: "ws_team", userId: "user_1" } },
      })
    );
    expect(mockPrisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to the oldest membership for a workspace the user left or never joined", async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(PERSONAL);
    await expect(getWorkspaceMembership("user_1", "ws_someone_else")).resolves.toMatchObject({
      workspace: { id: "ws_personal" },
    });
  });

  it("goes straight to the oldest membership without a preference", async () => {
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(PERSONAL);
    await getWorkspaceMembership("user_1", null);
    expect(mockPrisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });
});

describe("invite-only mode", () => {
  it("creates a personal workspace for any new user by default", async () => {
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    await expect(ensureWorkspaceForUser("user_1", "anyone@asu.edu")).resolves.toMatchObject({
      id: "ws_new",
    });
  });

  it("gives an uninvited user no workspace", async () => {
    process.env.INVITE_ONLY = "true";
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(null);
    await expect(ensureWorkspaceForUser("user_1", "stranger@asu.edu")).resolves.toBeNull();
    expect(mockPrisma.workspace.create).not.toHaveBeenCalled();
  });

  it("still lets an invited user in", async () => {
    process.env.INVITE_ONLY = "true";
    mockPrisma.workspaceMember.findFirst.mockResolvedValue(TEAM);
    await expect(ensureWorkspaceForUser("user_1", "invited@asu.edu")).resolves.toMatchObject({
      id: "ws_team",
    });
  });

  it("lets listed creators start a workspace", async () => {
    process.env.INVITE_ONLY = "true";
    process.env.WORKSPACE_CREATOR_EMAILS = "Admin@asu.edu, other@asu.edu";
    expect(canCreateOwnWorkspace("admin@ASU.edu")).toBe(true);
    expect(canCreateOwnWorkspace("stranger@asu.edu")).toBe(false);
    expect(canCreateOwnWorkspace(null)).toBe(false);
  });
});

describe("POST /api/workspace/active", () => {
  function request(body: unknown) {
    return new Request("http://localhost/api/workspace/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never;
  }

  it("requires a signed-in user", async () => {
    mockUserId.mockResolvedValue(null);
    expect((await switchWorkspace(request({ workspaceId: "ws_team" }))).status).toBe(401);
  });

  it("refuses a workspace the user is not a member of", async () => {
    mockUserId.mockResolvedValue("user_1");
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
    const response = await switchWorkspace(request({ workspaceId: "ws_other" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets the active workspace cookie for a member", async () => {
    mockUserId.mockResolvedValue("user_1");
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: "ws_team" });
    const response = await switchWorkspace(request({ workspaceId: "ws_team" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${ACTIVE_WORKSPACE_COOKIE}=ws_team`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});
