import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { createNotification, flushOutbox, type Outbox } from "@/features/appointments/events";
import { describeSlot } from "@/features/appointments/format";

const MS_PER_MINUTE = 60_000;
const BATCH_SIZE = 200;

/**
 * Sends a reminder for every booked appointment starting within REMINDER_LEAD_MINUTES that has not had one.
 * Safe to run concurrently or repeatedly: the reminderSentAt claim is a conditional UPDATE, so each
 * appointment is reminded exactly once even if two instances scan at the same moment.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<number> {
  const leadMs = config.reminderLeadMinutes * MS_PER_MINUTE;
  const due = await prisma.appointment.findMany({
    where: {
      status: "booked",
      reminderSentAt: null,
      slotStart: { gt: now, lte: new Date(now.getTime() + leadMs) },
    },
    select: {
      id: true,
      patientId: true,
      slotStart: true,
      createdAt: true,
      doctor: { select: { user: { select: { name: true } } } },
    },
    orderBy: { slotStart: "asc" },
    take: BATCH_SIZE,
  });

  let sent = 0;
  for (const appointment of due) {
    const outbox: Outbox = [];
    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.appointment.updateMany({
        where: { id: appointment.id, status: "booked", reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (claim.count === 0) return false;

      // Booked inside the reminder window: the confirmation already told them, so don't nag.
      const bookedInsideWindow = appointment.createdAt.getTime() > appointment.slotStart.getTime() - leadMs;
      if (bookedInsideWindow) return false;

      outbox.push(
        await createNotification(tx, {
          userId: appointment.patientId,
          type: "appointment_reminder",
          title: "Appointment reminder",
          body: `Your appointment with Dr. ${appointment.doctor.user.name} starts ${describeSlot(
            appointment.slotStart,
            config.clinicTimezone,
          )}. Check in when you arrive.`,
          appointmentId: appointment.id,
        }),
      );
      return true;
    });

    if (claimed) {
      flushOutbox(outbox);
      sent += 1;
    }
  }
  return sent;
}

const globalForScheduler = globalThis as unknown as { __mediconnectReminderTimer?: NodeJS.Timeout };

/**
 * In-process scheduler started from instrumentation.ts. Fine for a single instance; with several instances
 * either keep it (the claim makes duplicates harmless) or run sendDueReminders from one cron worker.
 */
export function startReminderScheduler(): void {
  if (globalForScheduler.__mediconnectReminderTimer) return;

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await sendDueReminders();
    } catch (error) {
      console.error("Reminder scan failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), config.reminderScanIntervalSeconds * 1000);
  timer.unref();
  globalForScheduler.__mediconnectReminderTimer = timer;
  void tick();
}
