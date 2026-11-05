import { NextRequest, NextResponse } from "next/server";
import { buildLoginUrl, getCasConfig, isCasEnabled, safeCallbackPath } from "@/lib/cas";

export async function GET(request: NextRequest) {
  if (!isCasEnabled()) {
    return new NextResponse("ASU sign-in is not enabled on this instance", { status: 404 });
  }

  const callbackPath = safeCallbackPath(request.nextUrl.searchParams.get("callbackUrl"));
  return NextResponse.redirect(buildLoginUrl(getCasConfig(), callbackPath));
}
