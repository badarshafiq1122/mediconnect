import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge middleware: role-area gate + redirects for signed-in users hitting /login. Route handlers and server
// actions re-check the session themselves; the middleware is never the only line of defence.
export default NextAuth(authConfig).auth;

export const config = {
  // API routes authenticate themselves and return 401 JSON instead of redirecting to the login page.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
