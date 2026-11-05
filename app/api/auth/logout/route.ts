import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";
import { getCasConfig, isCasEnabled } from "@/lib/cas";
import { deleteDatabaseSession, getSessionCookie } from "@/lib/cas-session";
import { getBaseUrl } from "@/lib/env";

/**
 * Sign-out for the ASU header, whose logout control is a plain link. Auth.js's
 * own signout endpoint only accepts a POST with its CSRF token, so this ends
 * the database session directly. It works for magic-link sessions too, and
 * hands off to CAS logout when CAS_LOGOUT_URL is set so the ASU session ends
 * as well.
 */
export async function GET(request: NextRequest) {
  const cookie = getSessionCookie();
  const sessionToken = request.cookies.get(cookie.name)?.value;
  if (sessionToken) {
    await deleteDatabaseSession(sessionToken).catch((error) => {
      console.error("[Logout] Failed to delete session:", error);
    });
  }

  const loginUrl = `${getBaseUrl()}/login`;
  const casLogoutUrl = isCasEnabled() ? getCasConfig().logoutUrl : null;
  let target = loginUrl;
  if (casLogoutUrl) {
    const url = new URL(casLogoutUrl);
    url.searchParams.set("service", loginUrl);
    target = url.toString();
  }

  const response = NextResponse.redirect(target);
  response.cookies.delete({ name: cookie.name, path: "/" });
  response.cookies.delete({ name: ACTIVE_WORKSPACE_COOKIE, path: "/" });
  return response;
}
