import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next internals)
     * - favicon.ico
     * - api routes (they run their own auth via lib/auth.ts's requireClientAccess)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
