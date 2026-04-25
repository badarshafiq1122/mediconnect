// Deliberately free of Prisma imports: this file is used by the Edge middleware bundle.

export const ROLES = ["patient", "doctor", "admin"] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_HOME: Record<RoleName, string> = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  admin: "/admin/overview",
};

// Role areas use real URL prefixes. Route groups like (patient)/dashboard and (doctor)/dashboard
// would resolve to the same /dashboard URL and fail the build.
export const ROLE_PREFIX: Record<RoleName, string> = {
  patient: "/patient",
  doctor: "/doctor",
  admin: "/admin",
};

export function roleOwningPath(pathname: string): RoleName | null {
  for (const role of ROLES) {
    const prefix = ROLE_PREFIX[role];
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return role;
  }
  return null;
}

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
