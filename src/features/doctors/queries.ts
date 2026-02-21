import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { DoctorFilters } from "@/features/doctors/validation";

export const DOCTORS_PAGE_SIZE = 12;

export type DoctorCardDTO = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  rating: number;
  ratingCount: number;
  /** Weekdays (0 = Sunday) on which the doctor has availability, ascending. */
  availableDays: number[];
};

export type DoctorDetailDTO = DoctorCardDTO & {
  isActive: boolean;
  availability: { id: string; dayOfWeek: number; startTime: string; endTime: string }[];
};

const cardSelect = {
  id: true,
  specialty: true,
  bio: true,
  rating: true,
  ratingCount: true,
  isActive: true,
  user: { select: { name: true } },
  availability: { select: { id: true, dayOfWeek: true, startTime: true, endTime: true } },
} satisfies Prisma.DoctorProfileSelect;

type DoctorRow = Prisma.DoctorProfileGetPayload<{ select: typeof cardSelect }>;

function toCard(row: DoctorRow): DoctorCardDTO {
  return {
    id: row.id,
    name: row.user.name,
    specialty: row.specialty,
    bio: row.bio,
    rating: row.rating,
    ratingCount: row.ratingCount,
    availableDays: [...new Set(row.availability.map((window) => window.dayOfWeek))].sort((a, b) => a - b),
  };
}

/**
 * Cursor-paginated doctor discovery. Order is (rating desc, id asc): `id` makes the order total so the cursor is
 * stable, and it matches the (isActive, rating desc, id) index so deep pages stay cheap.
 */
export async function searchDoctors(
  filters: DoctorFilters,
  limit: number = DOCTORS_PAGE_SIZE,
): Promise<{ doctors: DoctorCardDTO[]; nextCursor: string | null }> {
  const { q, specialty, day, minRating, cursor } = filters;

  const where: Prisma.DoctorProfileWhereInput = {
    isActive: true,
    ...(specialty ? { specialty: { equals: specialty, mode: "insensitive" } } : {}),
    ...(minRating !== undefined ? { rating: { gte: minRating } } : {}),
    ...(day !== undefined ? { availability: { some: { dayOfWeek: day } } } : {}),
    ...(q
      ? {
          OR: [
            { user: { name: { contains: q, mode: "insensitive" } } },
            { specialty: { contains: q, mode: "insensitive" } },
            { bio: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Fetch one extra row to learn whether another page exists without a COUNT query.
  const rows = await prisma.doctorProfile.findMany({
    where,
    select: cardSelect,
    orderBy: [{ rating: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { doctors: page.map(toCard), nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function listSpecialties(): Promise<string[]> {
  const rows = await prisma.doctorProfile.findMany({
    where: { isActive: true },
    distinct: ["specialty"],
    select: { specialty: true },
    orderBy: { specialty: "asc" },
  });
  return rows.map((row) => row.specialty);
}

export async function getDoctorDetail(doctorId: string, options: { includeInactive?: boolean } = {}): Promise<DoctorDetailDTO | null> {
  const row = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: cardSelect });
  if (!row || (!row.isActive && !options.includeInactive)) return null;
  return {
    ...toCard(row),
    isActive: row.isActive,
    availability: [...row.availability].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    ),
  };
}

export async function getDoctorDetailByUserId(userId: string): Promise<DoctorDetailDTO | null> {
  const row = await prisma.doctorProfile.findUnique({ where: { userId }, select: cardSelect });
  if (!row) return null;
  return {
    ...toCard(row),
    isActive: row.isActive,
    availability: [...row.availability].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    ),
  };
}

// --- Admin listing -----------------------------------------------------------------------------------

export type AdminDoctorRow = DoctorDetailDTO & { email: string; totalAppointments: number };

export async function listDoctorsForAdmin(): Promise<AdminDoctorRow[]> {
  const rows = await prisma.doctorProfile.findMany({
    select: {
      ...cardSelect,
      user: { select: { name: true, email: true } },
      _count: { select: { appointments: true } },
    },
    orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
  });
  return rows.map((row) => ({
    ...toCard(row),
    isActive: row.isActive,
    availability: [...row.availability].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
    ),
    email: row.user.email,
    totalAppointments: row._count.appointments,
  }));
}
