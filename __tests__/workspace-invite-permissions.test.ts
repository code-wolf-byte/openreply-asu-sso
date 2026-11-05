import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockContext } = vi.hoisted(() => ({
  mockPrisma: {
    instagramAccount: { count: vi.fn() },
    workspaceMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    workspaceInvitation: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
  mockContext: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ ensureWorkspaceForUser: vi.fn() }));
vi.mock("@/lib/workspace-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/workspace-access")>();
  return { ...actual, getCurrentWorkspaceContext: mockContext };
});

import { canInviteMembers } from "../lib/workspace-access";
import { DELETE, GET, POST } from "../app/api/workspace/members/route";

const ADMIN = { userId: "user_admin", workspaceId: "ws_1", role: "ADMIN" as const };

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/workspace/members", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.mockResolvedValue(ADMIN);
  mockPrisma.workspaceMember.findMany.mockResolvedValue([]);
  mockPrisma.workspaceInvitation.findMany.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue(null);
});

describe("canInviteMembers", () => {
  it("allows an admin who connected an account in this workspace", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(1);
    await expect(canInviteMembers(ADMIN)).resolves.toBe(true);
    expect(mockPrisma.instagramAccount.count).toHaveBeenCalledWith({
      where: { workspaceId: "ws_1", connectedByUserId: "user_admin" },
    });
  });

  it("refuses an owner who did not connect any account", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(0);
    await expect(canInviteMembers({ ...ADMIN, role: "OWNER" })).resolves.toBe(false);
  });

  it("refuses a connector who was demoted to member", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(1);
    await expect(canInviteMembers({ ...ADMIN, role: "MEMBER" })).resolves.toBe(false);
    expect(mockPrisma.instagramAccount.count).not.toHaveBeenCalled();
  });
});

describe("workspace members route", () => {
  it("reports canInvite to the settings page", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(0);
    const body = await (await GET()).json();
    expect(body.data).toMatchObject({ currentUserRole: "ADMIN", canInvite: false });
  });

  it("rejects invites from admins who did not connect an account", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(0);
    const response = await POST(jsonRequest("POST", { email: "new@asu.edu" }));
    expect(response.status).toBe(403);
    expect(mockPrisma.workspaceInvitation.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceMember.upsert).not.toHaveBeenCalled();
  });

  it("lets the connector invite", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(1);
    const response = await POST(jsonRequest("POST", { email: "New@asu.edu" }));
    expect(response.status).toBe(200);
    expect(mockPrisma.workspaceInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "new@asu.edu", invitedByUserId: "user_admin" }),
      })
    );
  });

  it("rejects revoking an invite before touching anything else in the request", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(0);
    const response = await DELETE(
      jsonRequest("DELETE", { memberId: "member_2", invitationId: "inv_1" })
    );
    expect(response.status).toBe(403);
    expect(mockPrisma.workspaceMember.delete).not.toHaveBeenCalled();
    expect(mockPrisma.workspaceInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("still lets any admin remove members", async () => {
    mockPrisma.instagramAccount.count.mockResolvedValue(0);
    mockPrisma.workspaceMember.findFirst.mockResolvedValue({
      id: "member_2",
      userId: "user_2",
      role: "MEMBER",
    });
    const response = await DELETE(jsonRequest("DELETE", { memberId: "member_2" }));
    expect(response.status).toBe(200);
    expect(mockPrisma.workspaceMember.delete).toHaveBeenCalledWith({ where: { id: "member_2" } });
  });
});
