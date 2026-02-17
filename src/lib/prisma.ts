import { PrismaClient } from "@prisma/client";

// Cached on globalThis so dev-server hot reloads do not open a new connection pool per reload.
const globalForPrisma = globalThis as unknown as { __mediconnectPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__mediconnectPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__mediconnectPrisma = prisma;
}
