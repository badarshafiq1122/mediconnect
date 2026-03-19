import { Prisma, type AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { addDaysToYmd, toYmd, zonedTimeToInstant } from "@/lib/time";

export const VOLUME_DAYS = 14;
const TOP_DOCTOR_DAYS = 30;

export type VolumePoint = { date: string; total: number; cancelled: number };

export type PlatformOverview = {
  totals: {
    patients: number;
    doctors: number;
    activeDoctors: number;
    appointments: number;
    appointmentsToday: number;
  };
  byStatus: Record<AppointmentStatus, number>;
  /** Appointments per clinic-local day for the last VOLUME_DAYS days, zero-filled, oldest first. */
  volume: VolumePoint[];
  topDoctors: { doctorId: string; name: string; specialty: string; appointments: number }[];
};

const ALL_STATUSES: AppointmentStatus[] = ["booked", "in_queue", "in_progress", "completed", "cancelled"];

/** Platform-wide numbers for the admin overview. Days are clinic-local and keyed by appointment (slot) date. */
export async function getPlatformOverview(now: Date = new Date()): Promise<PlatformOverview> {
  const tz = config.clinicTimezone;
  const today = toYmd(now, tz);
  const firstDay = addDaysToYmd(today, -(VOLUME_DAYS - 1));
  const from = zonedTimeToInstant(firstDay, "00:00", tz);
  const to = zonedTimeToInstant(addDaysToYmd(today, 1), "00:00", tz);
  const topSince = new Date(now.getTime() - TOP_DOCTOR_DAYS * 24 * 60 * 60 * 1000);

  const [patients, doctors, activeDoctors, appointments, statusRows, volumeRows, topRows] = await Promise.all([
    prisma.user.count({ where: { role: "patient" } }),
    prisma.doctorProfile.count(),
    prisma.doctorProfile.count({ where: { isActive: true } }),
    prisma.appointment.count(),
    prisma.appointment.groupBy({ by: ["status"], _count: { _all: true } }),
    // slot_start is a timestamp(3) holding UTC; the double AT TIME ZONE converts it to clinic-local wall time.
    prisma.$queryRaw<{ day: string; total: number; cancelled: number }[]>(Prisma.sql`
      SELECT to_char((slot_start AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             count(*)::int AS total,
             (count(*) FILTER (WHERE status = 'cancelled'))::int AS cancelled
      FROM "Appointment"
      WHERE slot_start >= ${from} AND slot_start < ${to}
      GROUP BY 1
      ORDER BY 1`),
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: { slotStart: { gte: topSince }, status: { not: "cancelled" } },
      _count: { _all: true },
      orderBy: { _count: { doctorId: "desc" } },
      take: 5,
    }),
  ]);

  const byStatus = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<AppointmentStatus, number>;
  for (const row of statusRows) byStatus[row.status] = row._count._all;

  const byDay = new Map(volumeRows.map((row) => [row.day, row]));
  const volume: VolumePoint[] = Array.from({ length: VOLUME_DAYS }, (_, index) => {
    const date = addDaysToYmd(firstDay, index);
    const row = byDay.get(date);
    return { date, total: row?.total ?? 0, cancelled: row?.cancelled ?? 0 };
  });

  const doctorRows = await prisma.doctorProfile.findMany({
    where: { id: { in: topRows.map((row) => row.doctorId) } },
    select: { id: true, specialty: true, user: { select: { name: true } } },
  });
  const doctorsById = new Map(doctorRows.map((row) => [row.id, row]));
  const topDoctors = topRows.flatMap((row) => {
    const doctor = doctorsById.get(row.doctorId);
    return doctor
      ? [{ doctorId: row.doctorId, name: doctor.user.name, specialty: doctor.specialty, appointments: row._count._all }]
      : [];
  });

  return {
    totals: {
      patients,
      doctors,
      activeDoctors,
      appointments,
      appointmentsToday: volume[volume.length - 1]?.total ?? 0,
    },
    byStatus,
    volume,
    topDoctors,
  };
}
