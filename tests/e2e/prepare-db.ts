import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/features/auth/password";

loadEnv({ quiet: true });

export const E2E_PASSWORD = "Password123!";
const url = process.env.E2E_DATABASE_URL ?? "postgresql://dev@localhost:5432/mediconnect_e2e?schema=public";

const databaseName = new URL(url).pathname.replace(/^\//, "");
if (!databaseName.endsWith("_e2e")) {
  throw new Error(`Refusing to reset "${databaseName}": the e2e database name must end with "_e2e".`);
}

async function main(): Promise<void> {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });

  const prisma = new PrismaClient({ datasourceUrl: url });
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification", "Message", "Appointment", "AvailabilitySlot", "DoctorProfile", "User" RESTART IDENTITY CASCADE',
  );

  const passwordHash = await hashPassword(E2E_PASSWORD);
  const everyDay = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "23:30" }));

  await prisma.user.create({ data: { name: "E2E Admin", email: "admin@e2e.test", passwordHash, role: "admin" } });
  const patients = await Promise.all(
    [1, 2].map((n) =>
      prisma.user.create({ data: { name: `E2E Patient ${n}`, email: `patient${n}@e2e.test`, passwordHash, role: "patient" } }),
    ),
  );

  // Available around the clock so the flow never depends on the time of day the suite runs.
  const doctor = await prisma.user.create({
    data: {
      name: "Dr. Eve Endtoend",
      email: "doctor@e2e.test",
      passwordHash,
      role: "doctor",
      doctorProfile: { create: { specialty: "E2E Medicine", bio: "Always-available test doctor.", availability: { create: everyDay } } },
    },
    include: { doctorProfile: true },
  });

  // A second doctor with history, so the admin chart has real data to render.
  const historian = await prisma.user.create({
    data: {
      name: "Dr. Hugo Historian",
      email: "historian@e2e.test",
      passwordHash,
      role: "doctor",
      doctorProfile: { create: { specialty: "Historical Medicine", availability: { create: everyDay } } },
    },
    include: { doctorProfile: true },
  });
  const now = Date.now();
  const past = Array.from({ length: 9 }, (_, index) => {
    const slotStart = new Date(now - (index + 1) * 26 * 60 * 60 * 1000);
    slotStart.setUTCMinutes(0, 0, 0);
    const cancelled = index % 4 === 0;
    return {
      patientId: patients[index % 2]!.id,
      doctorId: historian.doctorProfile!.id,
      slotStart,
      slotEnd: new Date(slotStart.getTime() + 30 * 60_000),
      status: cancelled ? ("cancelled" as const) : ("completed" as const),
      cancelledAt: cancelled ? slotStart : null,
      cancelledBy: cancelled ? ("patient" as const) : null,
    };
  });
  await prisma.appointment.createMany({ data: past });

  console.log(`e2e database ready (${doctor.email}, ${historian.email})`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
