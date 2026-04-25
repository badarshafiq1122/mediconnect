import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { minutesOfDay } from "@/lib/time";
import { hashPassword } from "@/features/auth/password";
import type { Actor } from "@/features/appointments/service";
import type { AvailabilityInput } from "@/features/doctors/validation";

// Doctor administration. Actors are explicit so the rules can be tested without a request context.

/** Weekday 09:00-17:00 in the clinic timezone: a sensible starting schedule the doctor then edits. */
export const DEFAULT_AVAILABILITY: AvailabilityInput = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
}));

function requireAdmin(actor: Actor): void {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Only administrators can manage doctors.");
}

export async function createDoctorAccount(
  actor: Actor,
  input: { name: string; email: string; password: string; specialty: string; bio: string },
): Promise<{ doctorId: string; userId: string }> {
  requireAdmin(actor);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "doctor",
        doctorProfile: {
          create: {
            specialty: input.specialty,
            bio: input.bio,
            availability: { create: DEFAULT_AVAILABILITY },
          },
        },
      },
      include: { doctorProfile: { select: { id: true } } },
    });
    return { doctorId: user.doctorProfile!.id, userId: user.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "An account with this email already exists.");
    }
    throw error;
  }
}

export async function updateDoctorProfile(
  actor: Actor,
  input: { doctorId: string; specialty: string; bio: string },
): Promise<void> {
  requireAdmin(actor);
  const result = await prisma.doctorProfile.updateMany({
    where: { id: input.doctorId },
    data: { specialty: input.specialty, bio: input.bio },
  });
  if (result.count === 0) throw new AppError("NOT_FOUND", "Doctor not found.");
}

/**
 * Deactivating hides the doctor from discovery and blocks new bookings. Existing appointments are left alone
 * so patients already scheduled are not silently dropped.
 */
export async function setDoctorActive(actor: Actor, input: { doctorId: string; isActive: boolean }): Promise<void> {
  requireAdmin(actor);
  const result = await prisma.doctorProfile.updateMany({
    where: { id: input.doctorId },
    data: { isActive: input.isActive },
  });
  if (result.count === 0) throw new AppError("NOT_FOUND", "Doctor not found.");
}

/**
 * Replaces a doctor's whole weekly availability atomically. Doctors edit their own; admins may edit anyone's.
 * Already-booked appointments outside the new windows stay valid: availability only governs *new* bookings.
 */
export async function replaceAvailability(
  actor: Actor,
  input: { doctorId?: string; windows: AvailabilityInput },
): Promise<void> {
  const profile =
    actor.role === "doctor"
      ? await prisma.doctorProfile.findUnique({ where: { userId: actor.id }, select: { id: true } })
      : actor.role === "admin" && input.doctorId
        ? await prisma.doctorProfile.findUnique({ where: { id: input.doctorId }, select: { id: true } })
        : null;
  if (!profile) {
    throw new AppError(actor.role === "patient" ? "FORBIDDEN" : "NOT_FOUND", "Doctor not found.");
  }
  // A doctor may not target someone else's schedule by passing a foreign doctorId.

  for (const window of input.windows) {
    if (minutesOfDay(window.endTime) - minutesOfDay(window.startTime) < config.slotMinutes) {
      throw new AppError(
        "VALIDATION",
        `Each availability window must be at least ${config.slotMinutes} minutes long (one appointment slot).`,
      );
    }
  }

  await prisma.$transaction([
    prisma.availabilitySlot.deleteMany({ where: { doctorId: profile.id } }),
    prisma.availabilitySlot.createMany({
      data: input.windows.map((window) => ({ doctorId: profile.id, ...window })),
    }),
  ]);
}
