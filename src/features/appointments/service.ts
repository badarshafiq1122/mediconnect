import type { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type { RoleName } from "@/lib/roles";
import {
  STATUS_LABEL,
  nextStatus,
  roleMayTrigger,
  type AppointmentEvent,
} from "@/features/appointments/status";
import { isBookableSlot, slotEndFor, type SlotPolicy } from "@/features/appointments/slots";
import { computeQueuePositions } from "@/features/appointments/queue";
import {
  appointmentUpdated,
  createNotification,
  flushOutbox,
  type Outbox,
} from "@/features/appointments/events";
import { describeSlot } from "@/features/appointments/format";
import { mapBookingError } from "@/features/appointments/errors";

// Domain logic with explicit actors and no Next.js request context, so tests can call it directly.
// Server actions (actions.ts) resolve the session, validate input and delegate here.

export type Actor = { id: string; role: RoleName; name: string };

const MS_PER_MINUTE = 60_000;

export function currentSlotPolicy(): SlotPolicy {
  return {
    slotMinutes: config.slotMinutes,
    leadMinutes: config.bookingLeadMinutes,
    timeZone: config.clinicTimezone,
  };
}

const notFound = () => new AppError("NOT_FOUND", "Appointment not found.");

// --- Booking ------------------------------------------------------------------

export async function bookAppointment(
  actor: Actor,
  input: { doctorId: string; slotStart: Date; reason?: string },
  now: Date = new Date(),
): Promise<{ id: string }> {
  if (actor.role !== "patient") throw new AppError("FORBIDDEN", "Only patients can book appointments.");

  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: input.doctorId },
    include: { availability: true, user: { select: { id: true, name: true } } },
  });
  if (!doctor || !doctor.isActive) throw new AppError("NOT_FOUND", "This doctor is not accepting bookings.");

  const policy = currentSlotPolicy();
  if (!isBookableSlot(doctor.availability, input.slotStart, policy, now)) {
    throw new AppError("SLOT_UNAVAILABLE", "That time is not an open slot for this doctor.");
  }

  const slotEnd = slotEndFor(input.slotStart, policy.slotMinutes);
  const when = describeSlot(input.slotStart, policy.timeZone);
  const outbox: Outbox = [];

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          patientId: actor.id,
          doctorId: doctor.id,
          slotStart: input.slotStart,
          slotEnd,
          reason: input.reason,
        },
        select: { id: true, status: true, queuePosition: true },
      });

      outbox.push(
        await createNotification(tx, {
          userId: actor.id,
          type: "appointment_confirmed",
          title: "Appointment confirmed",
          body: `With Dr. ${doctor.user.name} on ${when}.`,
          appointmentId: created.id,
        }),
        await createNotification(tx, {
          userId: doctor.user.id,
          type: "appointment_confirmed",
          title: "New appointment",
          body: `${actor.name} booked ${when}.`,
          appointmentId: created.id,
        }),
        appointmentUpdated(actor.id, created),
        appointmentUpdated(doctor.user.id, created),
      );
      return created;
    });

    flushOutbox(outbox);
    return { id: appointment.id };
  } catch (error) {
    throw mapBookingError(error);
  }
}

// --- Lifecycle (check-in / start / complete / cancel) ---------------------------

type Tx = Prisma.TransactionClient;

/** Serialises every queue-affecting transaction for one doctor so positions can never be duplicated. */
async function lockDoctor(tx: Tx, doctorId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DoctorProfile" WHERE id = ${doctorId} FOR UPDATE`;
}

async function loadOwnedAppointment(tx: Tx, actor: Actor, appointmentId: string) {
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: { select: { id: true, userId: true, user: { select: { name: true } } } },
      patient: { select: { id: true, name: true } },
    },
  });
  if (!appointment) throw notFound();
  const owns =
    (actor.role === "patient" && appointment.patientId === actor.id) ||
    (actor.role === "doctor" && appointment.doctor.userId === actor.id);
  // Same error as "missing" so appointment ids cannot be probed.
  if (!owns) throw notFound();
  return appointment;
}

/** Re-densifies positions after someone leaves the queue. Returns the patients whose position changed. */
async function recomputeQueue(
  tx: Tx,
  doctorId: string,
): Promise<{ id: string; patientId: string; position: number }[]> {
  const waiting = await tx.appointment.findMany({
    where: { doctorId, status: "in_queue" },
    select: { id: true, patientId: true, queuePosition: true, checkedInAt: true, slotStart: true },
  });
  const positions = computeQueuePositions(
    waiting.map((row) => ({ id: row.id, checkedInAt: row.checkedInAt ?? row.slotStart, slotStart: row.slotStart })),
  );

  const changed: { id: string; patientId: string; position: number }[] = [];
  for (const row of waiting) {
    const position = positions.get(row.id);
    if (position === undefined || position === row.queuePosition) continue;
    await tx.appointment.update({ where: { id: row.id }, data: { queuePosition: position } });
    changed.push({ id: row.id, patientId: row.patientId, position });
  }
  return changed;
}

function assertCheckInWindow(slotStart: Date, slotEnd: Date, now: Date): void {
  const opensAt = new Date(slotStart.getTime() - config.checkinOpensMinutes * MS_PER_MINUTE);
  if (now.getTime() < opensAt.getTime()) {
    throw new AppError(
      "CHECKIN_CLOSED",
      `Check-in opens at ${describeSlot(opensAt, config.clinicTimezone)}.`,
    );
  }
  if (now.getTime() > slotEnd.getTime()) {
    throw new AppError("CHECKIN_CLOSED", "This appointment's time has passed.");
  }
}

export async function transitionAppointment(
  actor: Actor,
  input: { appointmentId: string; event: AppointmentEvent; notes?: string; reason?: string },
  now: Date = new Date(),
): Promise<{ status: AppointmentStatus }> {
  if (!roleMayTrigger(actor.role, input.event)) {
    throw new AppError("FORBIDDEN", "You are not allowed to do that.");
  }
  const outbox: Outbox = [];

  const status = await prisma.$transaction(async (tx) => {
    const appointment = await loadOwnedAppointment(tx, actor, input.appointmentId);
    const target = nextStatus(appointment.status, input.event);
    if (!target) {
      throw new AppError(
        "INVALID_TRANSITION",
        `That action isn't available while the appointment is ${STATUS_LABEL[appointment.status].toLowerCase()}.`,
      );
    }
    if (input.event === "check_in") assertCheckInWindow(appointment.slotStart, appointment.slotEnd, now);

    await lockDoctor(tx, appointment.doctorId);

    const data: Prisma.AppointmentUpdateManyMutationInput = { status: target };

    switch (input.event) {
      case "check_in": {
        // Placeholder at the tail (the CHECK constraint needs a position while in_queue); recomputeQueue below
        // then ranks everyone by check-in time, so stored positions always equal the FIFO order.
        const waiting = await tx.appointment.count({
          where: { doctorId: appointment.doctorId, status: "in_queue" },
        });
        data.queuePosition = waiting + 1;
        data.checkedInAt = now;
        break;
      }
      case "start": {
        const busy = await tx.appointment.findFirst({
          where: { doctorId: appointment.doctorId, status: "in_progress" },
          select: { id: true },
        });
        if (busy) throw new AppError("DOCTOR_BUSY", "Finish the current consultation before starting another.");
        data.queuePosition = null;
        data.startedAt = now;
        break;
      }
      case "complete":
        data.completedAt = now;
        if (input.notes !== undefined) data.notes = input.notes;
        break;
      case "cancel":
        data.queuePosition = null;
        data.cancelledAt = now;
        data.cancelledBy = actor.role;
        break;
    }

    // The status predicate makes the transition atomic: a concurrent change matches zero rows.
    const updated = await tx.appointment.updateMany({
      where: { id: appointment.id, status: appointment.status },
      data,
    });
    if (updated.count !== 1) {
      throw new AppError("INVALID_TRANSITION", "This appointment was just updated. Refresh and try again.");
    }

    // Joining or leaving the queue can shift other patients; re-rank and tell everyone whose position moved.
    const touchesQueue = input.event === "check_in" || appointment.status === "in_queue";
    const moved = touchesQueue ? await recomputeQueue(tx, appointment.doctorId) : [];
    const summary = await tx.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      select: { id: true, status: true, queuePosition: true },
    });

    outbox.push(
      appointmentUpdated(appointment.patientId, summary),
      appointmentUpdated(appointment.doctor.userId, summary),
      ...moved
        .filter((entry) => entry.id !== appointment.id)
        .map((entry) =>
          appointmentUpdated(entry.patientId, { id: entry.id, status: "in_queue", queuePosition: entry.position }),
        ),
    );

    if (input.event === "cancel") {
      const when = describeSlot(appointment.slotStart, config.clinicTimezone);
      const byPatient = actor.role === "patient";
      const reasonSuffix = input.reason ? ` Reason: ${input.reason}` : "";
      outbox.push(
        await createNotification(tx, {
          userId: byPatient ? appointment.doctor.userId : appointment.patientId,
          type: "appointment_cancelled",
          title: "Appointment cancelled",
          body: byPatient
            ? `${appointment.patient.name} cancelled ${when}.${reasonSuffix}`
            : `Dr. ${appointment.doctor.user.name} cancelled your appointment on ${when}.${reasonSuffix}`,
          appointmentId: appointment.id,
        }),
      );
    }

    return target;
  });

  flushOutbox(outbox);
  return { status };
}

// --- Notes and ratings -----------------------------------------------------------

export async function saveConsultationNotes(
  actor: Actor,
  input: { appointmentId: string; notes: string },
): Promise<void> {
  if (actor.role !== "doctor") throw new AppError("FORBIDDEN", "Only doctors can edit consultation notes.");
  const result = await prisma.appointment.updateMany({
    where: {
      id: input.appointmentId,
      doctor: { userId: actor.id },
      status: { in: ["in_queue", "in_progress", "completed"] },
    },
    data: { notes: input.notes.length > 0 ? input.notes : null },
  });
  if (result.count === 0) throw notFound();
}

export async function rateAppointment(
  actor: Actor,
  input: { appointmentId: string; rating: number },
): Promise<void> {
  if (actor.role !== "patient") throw new AppError("FORBIDDEN", "Only patients can rate a consultation.");

  await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id: input.appointmentId, patientId: actor.id },
      select: { id: true, doctorId: true, status: true },
    });
    if (!appointment) throw notFound();
    if (appointment.status !== "completed") {
      throw new AppError("INVALID_TRANSITION", "You can rate a consultation once it is completed.");
    }

    await lockDoctor(tx, appointment.doctorId);
    // rating IS NULL in the predicate makes a double-submit a no-op instead of a second vote.
    const claimed = await tx.appointment.updateMany({
      where: { id: appointment.id, rating: null },
      data: { rating: input.rating },
    });
    if (claimed.count !== 1) throw new AppError("CONFLICT", "You already rated this consultation.");

    const aggregate = await tx.appointment.aggregate({
      where: { doctorId: appointment.doctorId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.doctorProfile.update({
      where: { id: appointment.doctorId },
      data: {
        rating: Math.round((aggregate._avg.rating ?? 0) * 100) / 100,
        ratingCount: aggregate._count.rating,
      },
    });
  });
}
