import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import { CAS_PROVIDER_ID, type CasIdentity } from "@/lib/cas";

// Auth.js's default database session lifetime; lib/auth.ts does not override it.
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The cookie Auth.js reads its database session token from. It switches to
 * the __Secure- prefix on HTTPS, keyed off the same URL it uses.
 */
export function getSessionCookie() {
  const secure = getBaseUrl().startsWith("https://");
  return {
    name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure,
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}

/**
 * Finds the user behind a CAS identity, creating or linking one if needed.
 *
 * Lookup order: an existing asu-cas Account, then a user with the same email
 * (someone who signed in by magic link before SSO was turned on), then a new
 * user. CAS has already proven the address, so linking by email is safe here
 * in a way it would not be for an arbitrary OAuth provider.
 */
export async function findOrCreateCasUser(identity: CasIdentity): Promise<string> {
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: CAS_PROVIDER_ID,
        providerAccountId: identity.asurite,
      },
    },
    select: { userId: true },
  });

  if (account) {
    await prisma.user.update({
      where: { id: account.userId },
      data: identity.name ? { name: identity.name } : {},
    });
    return account.userId;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true, name: true },
  });

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        emailVerified: new Date(),
      },
      select: { id: true, name: true },
    }));

  await prisma.account.create({
    data: {
      userId: user.id,
      type: "oidc",
      provider: CAS_PROVIDER_ID,
      providerAccountId: identity.asurite,
    },
  });

  if (!existingUser) {
    // Mirrors the createUser event in lib/auth.ts, which only fires for
    // users Auth.js itself creates.
    await ensureWorkspaceForUser(user.id, identity.email);
  } else if (!existingUser.name && identity.name) {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: identity.name },
    });
  }

  return user.id;
}

export async function createDatabaseSession(userId: string): Promise<string> {
  const sessionToken = randomUUID();
  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  return sessionToken;
}

export async function deleteDatabaseSession(sessionToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { sessionToken } });
}
