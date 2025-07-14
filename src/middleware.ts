import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "auth/server";
import { setCurrentUserId, clearCurrentUserId } from "lib/db/pg/db.pg";
import logger from "logger";

export async function middleware(request: NextRequest) {
  try {
    const session = await getSession();

    // Set user ID in PostgreSQL session for RLS
    if (session?.user?.id) {
      await setCurrentUserId(session.user.id);
      logger.debug(
        `Set current user ID in PostgreSQL session: ${session.user.id}`,
      );
    } else {
      await clearCurrentUserId();
      logger.debug("Cleared current user ID from PostgreSQL session");
    }

    // For API routes that require authentication
    if (request.nextUrl.pathname.startsWith("/api/") && !session?.user?.id) {
      if (request.headers.get("accept")?.includes("text/html")) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
      }
      return new NextResponse("Unauthorized", { status: 401 });
    }

    return NextResponse.next();
  } catch (error) {
    logger.error("Middleware error:", error);
    await clearCurrentUserId();
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export const config = {
  matcher: [
    "/api/chat/:path*",
    "/api/thread/:path*",
    "/api/mcp/:path*",
    "/api/user/:path*",
    "/chat/:path*",
    "/project/:path*",
  ],
};
