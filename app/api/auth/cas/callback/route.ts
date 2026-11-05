import { NextRequest, NextResponse } from "next/server";
import {
  extractCasIdentity,
  getCasConfig,
  isCasEnabled,
  safeCallbackPath,
  validateCasTicket,
} from "@/lib/cas";
import { createDatabaseSession, findOrCreateCasUser, getSessionCookie } from "@/lib/cas-session";
import { getBaseUrl, isEmailAllowedToSignIn } from "@/lib/env";

function loginError(code: string) {
  return NextResponse.redirect(`${getBaseUrl()}/login?error=${code}`);
}

export async function GET(request: NextRequest) {
  if (!isCasEnabled()) {
    return new NextResponse("ASU sign-in is not enabled on this instance", { status: 404 });
  }

  const ticket = request.nextUrl.searchParams.get("ticket");
  const callbackPath = safeCallbackPath(request.nextUrl.searchParams.get("callbackUrl"));
  if (!ticket) {
    return loginError("CasMissingTicket");
  }

  const config = getCasConfig();
  const result = await validateCasTicket(config, ticket, callbackPath);
  if (!result.ok) {
    console.warn("[CAS Callback] Ticket validation failed:", result.reason);
    return loginError("CasValidationFailed");
  }

  const identity = extractCasIdentity(config, result.user, result.attributes);
  // Same allowlist the magic-link provider enforces in lib/auth.ts.
  if (!isEmailAllowedToSignIn(identity.email)) {
    console.warn("[CAS Callback] Sign-in blocked by ALLOWED_EMAILS:", identity.asurite);
    return loginError("AccessDenied");
  }

  try {
    const userId = await findOrCreateCasUser(identity);
    const sessionToken = await createDatabaseSession(userId);
    const cookie = getSessionCookie();

    const response = NextResponse.redirect(`${getBaseUrl()}${callbackPath ?? "/dashboard"}`);
    response.cookies.set(cookie.name, sessionToken, cookie.options);
    return response;
  } catch (error) {
    console.error("[CAS Callback] Failed to create session:", error);
    return loginError("CasSessionFailed");
  }
}
