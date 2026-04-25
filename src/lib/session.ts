import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ROLE_HOME, type RoleName } from "@/lib/roles";

export type SessionUser = {
  id: string;
  role: RoleName;
  name: string;
  email: string;
};

/** Memoised per request so layouts, pages and queries can all ask without re-decoding the JWT. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.role) return null;
  return { id: user.id, role: user.role, name: user.name ?? "", email: user.email ?? "" };
});

/** For pages and layouts: redirects instead of throwing. Middleware is the first gate; this is the second. */
export async function requirePageUser(...roles: RoleName[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles.length > 0 && !roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/** For server actions and route handlers: throws an AppError the caller maps to a response. */
export async function requireActor(...roles: RoleName[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "You are not allowed to do that.");
  }
  return user;
}
