import type { NextAuthConfig } from "next-auth";
import { ROLE_HOME, isRoleName, roleOwningPath } from "@/lib/roles";

// Edge-safe half of the Auth.js config (no Prisma, no bcrypt). The middleware imports only this file.

const AUTH_PAGES = new Set(["/login", "/register"]);

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const role = auth?.user?.role;
      const owner = roleOwningPath(nextUrl.pathname);

      if (owner) {
        if (!role) return false; // Auth.js redirects to /login?callbackUrl=...
        if (role !== owner) return Response.redirect(new URL(ROLE_HOME[role], nextUrl));
        return true;
      }
      if (role && AUTH_PAGES.has(nextUrl.pathname)) {
        return Response.redirect(new URL(ROLE_HOME[role], nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string" && isRoleName(token.role)) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
