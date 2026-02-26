import type { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/session";
import { addDaysToYmd, toYmd, zonedTimeToInstant } from "@/lib/time";
import { ACTIVE_STATUSES } from "@/features/appointments/status";
import { estimateWaitMinutes } from "@/features/appointments/queue";
import { generateSlots } from "@/features/appointments/slots";
import { currentSlotPolicy } from "@/features/appointments/service";

// Read side. Everything returned is plain JSON (ISO strings, no Prisma types) so it can cross the
// Server Component -> Client Component boundary and be returned verbatim from route handlers.

export const BOOKING_HORIZON_DAYS = 7;
const MS_PER_MINUTE = 60_000;

export type AppointmentDTO = {
  id: string;
  status: AppointmentStatus;
  slotStart: string;
  slotEnd: string;
  queuePosition: number | null;
  reason: string | null;
  rating: number | null;
  checkInOpensAt: string;
  doctor: { id: string; userId: string; name: string; specialty: string };
  patient: { id: string; name: string };
  /** Present only while status is in_queue. */
  queue: { position: number; ahead: number; doctorBusy: boolean; estimatedWaitMinutes: number } | null;
};

const appointmentInclude = {
  doctor: { select: { id: true, userId: true, specialty: true, user: { select: { name: true } } } },
  patient: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

async function busyDoctorIds(rows: readonly AppointmentRow[]): Promise<Set<string>> {
  const doctorIds = [...new Set(rows.filter((row) => row.status === "in_queue").map((row) => row.doctorId))];
  if (doctorIds.length === 0) return new Set();
  const busy = await prisma.appointment.findMany({
    where: { doctorId: { in: doctorIds }, status: "in_progress" },
    select: { doctorId: true },
  });
  return new Set(busy.map((row) => row.doctorId));
}

function toAppointmentDTO(row: AppointmentRow, busyDoctors: ReadonlySet<string>): AppointmentDTO {
  const doctorBusy = busyDoctors.has(row.doctorId);
  return {
    id: row.id,
    status: row.status,
    slotStart: row.slotStart.toISOString(),
    slotEnd: row.slotEnd.toISOString(),
    queuePosition: row.queuePosition,
    reason: row.reason,
    rating: row.rating,
    checkInOpensAt: new Date(row.slotStart.getTime() - config.checkinOpensMinutes * MS_PER_MINUTE).toISOString(),
    doctor: {
      id: row.doctor.id,
      userId: row.doctor.userId,
      name: row.doctor.user.name,
      specialty: row.doctor.specialty,
    },
    patient: { id: row.patient.id, name: row.patient.name },
    queue:
      row.status === "in_queue" && row.queuePosition !== null
        ? {
            position: row.queuePosition,
            ahead: row.queuePosition - 1,
            doctorBusy,
            estimatedWaitMinutes: estimateWaitMinutes({
              position: row.queuePosition,
              doctorBusy,
              slotMinutes: config.slotMinutes,
            }),
          }
        : null,
  };
}

async function toDTOs(rows: AppointmentRow[]): Promise<AppointmentDTO[]> {
  const busy = await busyDoctorIds(rows);
  return rows.map((row) => toAppointmentDTO(row, busy));
}

/** [start, end) of the clinic-local calendar day containing `now`, as UTC instants. */
export function clinicDayRange(now: Date): { start: Date; end: Date; ymd: string } {
  const ymd = toYmd(now, config.clinicTimezone);
  return {
    ymd,
    start: zonedTimeToInstant(ymd, "00:00", config.clinicTimezone),
    end: zonedTimeToInstant(addDaysToYmd(ymd, 1), "00:00", config.clinicTimezone),
  };
}

// --- Live queue snapshot (shared by Server Components, the poll fallback and SSE-triggered refetches) ------

export type QueueSnapshot =
  | { role: "patient"; appointments: AppointmentDTO[] }
  | { role: "doctor"; today: AppointmentDTO[]; waiting: AppointmentDTO[]; inProgress: AppointmentDTO | null }
  | { role: "admin" };

export async function getQueueSnapshot(user: SessionUser, now: Date = new Date()): Promise<QueueSnapshot> {
  if (user.role === "patient") {
    const rows = await prisma.appointment.findMany({
      where: { patientId: user.id, status: { in: [...ACTIVE_STATUSES] } },
      include: appointmentInclude,
      orderBy: { slotStart: "asc" },
    });
    return { role: "patient", appointments: await toDTOs(rows) };
  }

  if (user.role === "doctor") {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!profile) return { role: "doctor", today: [], waiting: [], inProgress: null };

    const { start, end } = clinicDayRange(now);
    const [todayRows, waitingRows, inProgressRow] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId: profile.id, slotStart: { gte: start, lt: end }, status: { not: "cancelled" } },
        include: appointmentInclude,
        orderBy: { slotStart: "asc" },
      }),
      prisma.appointment.findMany({
        where: { doctorId: profile.id, status: "in_queue" },
        include: appointmentInclude,
        orderBy: { queuePosition: "asc" },
      }),
      prisma.appointment.findFirst({
        where: { doctorId: profile.id, status: "in_progress" },
        include: appointmentInclude,
      }),
    ]);
    const [today, waiting, inProgress] = await Promise.all([
      toDTOs(todayRows),
      toDTOs(waitingRows),
      inProgressRow ? toDTOs([inProgressRow]) : Promise.resolve([]),
    ]);
    return { role: "doctor", today, waiting, inProgress: inProgress[0] ?? null };
  }

  return { role: "admin" };
}

// --- Patient views ---------------------------------------------------------------------------------------

export async function getPatientHistory(patientId: string, limit = 15): Promise<AppointmentDTO[]> {
  const rows = await prisma.appointment.findMany({
    where: { patientId, status: { in: ["completed", "cancelled"] } },
    include: appointmentInclude,
    orderBy: { slotStart: "desc" },
    take: limit,
  });
  return toDTOs(rows);
}

// --- Appointment detail (patient or treating doctor only) --------------------------------------------------

export type HistoryEntryDTO = { id: string; slotStart: string; reason: string | null; notes: string | null };

export type AppointmentDetail = {
  viewer: "patient" | "doctor";
  appointment: AppointmentDTO;
  /** Clinical notes are doctor-only: never populated for the patient viewer. */
  notes: string | null;
  /** Earlier completed visits between this doctor and this patient. Doctor-only. */
  history: HistoryEntryDTO[];
};

export async function getAppointmentDetail(user: SessionUser, appointmentId: string): Promise<AppointmentDetail | null> {
  const row = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: appointmentInclude });
  if (!row) return null;

  const isPatient = user.role === "patient" && row.patientId === user.id;
  const isDoctor = user.role === "doctor" && row.doctor.userId === user.id;
  if (!isPatient && !isDoctor) return null;

  const [appointment] = await toDTOs([row]);
  if (isPatient) return { viewer: "patient", appointment: appointment!, notes: null, history: [] };

  const [full, previous] = await Promise.all([
    prisma.appointment.findUniqueOrThrow({ where: { id: row.id }, select: { notes: true } }),
    prisma.appointment.findMany({
      where: { doctorId: row.doctorId, patientId: row.patientId, status: "completed", id: { not: row.id } },
      select: { id: true, slotStart: true, reason: true, notes: true },
      orderBy: { slotStart: "desc" },
      take: 5,
    }),
  ]);
  return {
    viewer: "doctor",
    appointment: appointment!,
    notes: full.notes,
    history: previous.map((entry) => ({ ...entry, slotStart: entry.slotStart.toISOString() })),
  };
}

// --- Doctor schedule ---------------------------------------------------------------------------------------

export async function getDoctorUpcoming(userId: string, days = 7, now: Date = new Date()): Promise<AppointmentDTO[]> {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];
  const { start, ymd } = clinicDayRange(now);
  const end = zonedTimeToInstant(addDaysToYmd(ymd, days), "00:00", config.clinicTimezone);
  const rows = await prisma.appointment.findMany({
    where: { doctorId: profile.id, slotStart: { gte: start, lt: end }, status: { not: "cancelled" } },
    include: appointmentInclude,
    orderBy: { slotStart: "asc" },
  });
  return toDTOs(rows);
}

/** Distinct patients this doctor has completed visits with, most recent first (dashboard "recent patients"). */
export async function getRecentPatients(
  userId: string,
  limit = 6,
): Promise<{ patientId: string; name: string; lastVisit: string; visits: number }[]> {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];
  const grouped = await prisma.appointment.groupBy({
    by: ["patientId"],
    where: { doctorId: profile.id, status: "completed" },
    _max: { slotStart: true },
    _count: { _all: true },
    orderBy: { _max: { slotStart: "desc" } },
    take: limit,
  });
  const patients = await prisma.user.findMany({
    where: { id: { in: grouped.map((entry) => entry.patientId) } },
    select: { id: true, name: true },
  });
  const names = new Map(patients.map((patient) => [patient.id, patient.name]));
  return grouped.map((entry) => ({
    patientId: entry.patientId,
    name: names.get(entry.patientId) ?? "Unknown patient",
    lastVisit: (entry._max.slotStart ?? new Date(0)).toISOString(),
    visits: entry._count._all,
  }));
}

// --- Slot picker ---------------------------------------------------------------------------------------------

export type SlotDTO = { start: string; end: string; available: boolean };
export type DaySlotsDTO = { date: string; dayOfWeek: number; slots: SlotDTO[] };

export async function getDoctorSlots(doctorId: string, now: Date = new Date()): Promise<DaySlotsDTO[]> {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { isActive: true, availability: true },
  });
  if (!doctor || !doctor.isActive) return [];

  const policy = currentSlotPolicy();
  const horizonEnd = zonedTimeToInstant(
    addDaysToYmd(toYmd(now, policy.timeZone), BOOKING_HORIZON_DAYS),
    "00:00",
    policy.timeZone,
  );
  const taken = await prisma.appointment.findMany({
    where: { doctorId, status: { in: [...ACTIVE_STATUSES] }, slotStart: { gte: now, lt: horizonEnd } },
    select: { slotStart: true },
  });

  return generateSlots({
    windows: doctor.availability,
    policy,
    now,
    days: BOOKING_HORIZON_DAYS,
    takenStarts: new Set(taken.map((row) => row.slotStart.getTime())),
  }).map((day) => ({
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    slots: day.slots.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      available: slot.available,
    })),
  }));
}
