import { prisma } from "@/lib/prisma";
import type { Actor } from "@/features/appointments/service";

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

/** Wipes every table. Only ever called from integration tests, which are locked to a *_test database. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification", "Message", "Appointment", "AvailabilitySlot", "DoctorProfile", "User" RESTART IDENTITY CASCADE',
  );
}

export type TestPatient = Actor & { email: string };

export async function createPatient(name = `Patient ${next()}`): Promise<TestPatient> {
  const user = await prisma.user.create({
    data: {
      name,
      email: `patient${next()}@test.local`,
      // Not a real hash: integration tests never authenticate through bcrypt.
      passwordHash: "x",
      role: "patient",
    },
  });
  return { id: user.id, role: "patient", name: user.name, email: user.email };
}

export type TestDoctor = Actor & { doctorId: string; email: string };

/** A doctor available every day 00:00-23:30, so any test slot on any weekday is valid. */
export async function createDoctor(
  options: {
    name?: string;
    specialty?: string;
    isActive?: boolean;
    rating?: number;
    availability?: { dayOfWeek: number; startTime: string; endTime: string }[];
  } = {},
): Promise<TestDoctor> {
  const availability =
    options.availability ??
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "00:00", endTime: "23:30" }));

  const user = await prisma.user.create({
    data: {
      name: options.name ?? `Doctor ${next()}`,
      email: `doctor${next()}@test.local`,
      passwordHash: "x",
      role: "doctor",
      doctorProfile: {
        create: {
          specialty: options.specialty ?? "General Practice",
          bio: "Test doctor",
          isActive: options.isActive ?? true,
          rating: options.rating ?? 0,
          availability: { create: availability },
        },
      },
    },
    include: { doctorProfile: true },
  });
  return {
    id: user.id,
    role: "doctor",
    name: user.name,
    email: user.email,
    doctorId: user.doctorProfile!.id,
  };
}

/** Monday 2030-01-07 09:00 UTC: a fixed "now" so slot arithmetic in tests never depends on the wall clock. */
export const NOW = new Date("2030-01-07T09:00:00.000Z");

export const slotAt = (time: string, day = "2030-01-07") => new Date(`${day}T${time}:00.000Z`);
