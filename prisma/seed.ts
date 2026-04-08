import { PrismaClient, type AppointmentStatus } from "@prisma/client";
import { hashPassword } from "../src/features/auth/password";
import { generateSlots } from "../src/features/appointments/slots";
import { bookAppointment, currentSlotPolicy } from "../src/features/appointments/service";
import { addDaysToYmd, toYmd, zonedTimeToInstant } from "../src/lib/time";
import { config } from "../src/lib/config";

// Local-development seed. Idempotent: users/doctors are upserted by email, history is only created on an empty
// appointments table. Every seeded account uses the password below (never use these outside local development).

const prisma = new PrismaClient();
export const SEED_PASSWORD = "Password123!";

type SeedDoctor = {
  name: string;
  email: string;
  specialty: string;
  bio: string;
  /** Target average rating; the seeded ratings are generated around it. */
  targetRating: number;
  days: number[];
  morning: [string, string];
  afternoon?: [string, string];
};

const DOCTORS: SeedDoctor[] = [
  { name: "Dr. Sarah Chen", email: "sarah.chen@mediconnect.test", specialty: "Cardiology", targetRating: 4.9, days: [1, 2, 3, 4], morning: ["09:00", "13:00"], afternoon: ["14:00", "17:00"], bio: "Interventional cardiologist focused on preventive heart care, hypertension and post-cardiac-event recovery." },
  { name: "Dr. Marcus Johnson", email: "marcus.johnson@mediconnect.test", specialty: "Dermatology", targetRating: 4.7, days: [1, 3, 5], morning: ["08:30", "12:30"], afternoon: ["13:30", "16:30"], bio: "Board-certified dermatologist treating acne, eczema, psoriasis and skin-cancer screening." },
  { name: "Dr. Priya Patel", email: "priya.patel@mediconnect.test", specialty: "Pediatrics", targetRating: 4.8, days: [1, 2, 3, 4, 5], morning: ["09:00", "12:00"], afternoon: ["13:00", "16:00"], bio: "Pediatrician caring for newborns through adolescents: vaccinations, growth checks and acute illness." },
  { name: "Dr. James O'Connor", email: "james.oconnor@mediconnect.test", specialty: "Orthopedics", targetRating: 4.5, days: [2, 4], morning: ["09:00", "13:00"], afternoon: ["14:00", "17:00"], bio: "Orthopedic surgeon specialising in sports injuries, joint pain and rehabilitation planning." },
  { name: "Dr. Elena Rossi", email: "elena.rossi@mediconnect.test", specialty: "General Practice", targetRating: 4.6, days: [1, 2, 3, 4, 5], morning: ["08:00", "12:00"], afternoon: ["13:00", "17:00"], bio: "Family physician offering routine check-ups, chronic-condition management and same-week appointments." },
  { name: "Dr. David Kim", email: "david.kim@mediconnect.test", specialty: "Neurology", targetRating: 4.4, days: [2, 3, 5], morning: ["10:00", "13:00"], afternoon: ["14:00", "16:00"], bio: "Neurologist treating migraines, epilepsy, neuropathy and movement disorders." },
  { name: "Dr. Amara Okafor", email: "amara.okafor@mediconnect.test", specialty: "Psychiatry", targetRating: 4.9, days: [1, 2, 4, 5], morning: ["09:00", "12:00"], afternoon: ["13:00", "18:00"], bio: "Psychiatrist supporting anxiety, depression and ADHD with therapy-first, evidence-based care." },
  { name: "Dr. Liam Nguyen", email: "liam.nguyen@mediconnect.test", specialty: "General Practice", targetRating: 4.2, days: [3, 4, 5, 6], morning: ["09:00", "13:00"], bio: "General practitioner with weekend availability for urgent-but-not-emergency concerns." },
];

const PATIENTS = [
  { name: "Alex Rivera", email: "alex.rivera@mediconnect.test" },
  { name: "Bianca Torres", email: "bianca.torres@mediconnect.test" },
  { name: "Chris Walker", email: "chris.walker@mediconnect.test" },
  { name: "Dana Lee", email: "dana.lee@mediconnect.test" },
  { name: "Evan Brooks", email: "evan.brooks@mediconnect.test" },
  { name: "Fatima Khan", email: "fatima.khan@mediconnect.test" },
];

/** Small deterministic PRNG so the seeded history is identical on every machine. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function upsertUser(name: string, email: string, role: "patient" | "doctor" | "admin", passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { name, email, role, passwordHash },
  });
}

async function seedPeople(): Promise<{ doctorIds: Map<string, string>; patientIds: string[] }> {
  const passwordHash = await hashPassword(SEED_PASSWORD);
  await upsertUser("Morgan Admin", "admin@mediconnect.test", "admin", passwordHash);

  const doctorIds = new Map<string, string>();
  for (const doctor of DOCTORS) {
    const user = await upsertUser(doctor.name, doctor.email, "doctor", passwordHash);
    const windows = [doctor.morning, doctor.afternoon].flatMap((range) =>
      range ? doctor.days.map((dayOfWeek) => ({ dayOfWeek, startTime: range[0], endTime: range[1] })) : [],
    );
    const profile = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: { specialty: doctor.specialty, bio: doctor.bio },
      create: { userId: user.id, specialty: doctor.specialty, bio: doctor.bio },
    });
    await prisma.availabilitySlot.deleteMany({ where: { doctorId: profile.id } });
    await prisma.availabilitySlot.createMany({ data: windows.map((window) => ({ doctorId: profile.id, ...window })) });
    doctorIds.set(doctor.email, profile.id);
  }

  const patientIds: string[] = [];
  for (const patient of PATIENTS) {
    patientIds.push((await upsertUser(patient.name, patient.email, "patient", passwordHash)).id);
  }
  return { doctorIds, patientIds };
}

/** Past consultations spread over the last 30 days so history, ratings and the admin volume chart have data. */
async function seedHistory(doctorIds: Map<string, string>, patientIds: string[]): Promise<number> {
  if ((await prisma.appointment.count()) > 0) return 0;

  const random = lcg(20260924);
  const tz = config.clinicTimezone;
  const today = toYmd(new Date(), tz);
  const rows: {
    patientId: string;
    doctorId: string;
    slotStart: Date;
    slotEnd: Date;
    status: AppointmentStatus;
    rating: number | null;
    reason: string;
    checkedInAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancelledBy: "patient" | null;
  }[] = [];

  const reasons = ["Routine check-up", "Follow-up visit", "New symptoms", "Prescription review", "Test results discussion", "Second opinion"];
  const used = new Set<string>();

  for (const doctor of DOCTORS) {
    const doctorId = doctorIds.get(doctor.email)!;
    for (let daysAgo = 1; daysAgo <= 30; daysAgo += 1) {
      const ymd = addDaysToYmd(today, -daysAgo);
      const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
      if (!doctor.days.includes(weekday)) continue;
      const perDay = random() < 0.65 ? 1 + Math.floor(random() * 3) : 0;

      for (let n = 0; n < perDay; n += 1) {
        const minutes = 9 * 60 + Math.floor(random() * 14) * 30;
        const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        const slotStart = zonedTimeToInstant(ymd, hhmm, tz);
        const patientId = patientIds[Math.floor(random() * patientIds.length)]!;
        const key = `${doctorId}|${slotStart.toISOString()}`;
        if (used.has(key)) continue;
        used.add(key);

        const cancelled = random() < 0.12;
        const slotEnd = new Date(slotStart.getTime() + config.slotMinutes * 60_000);
        // Ratings scatter around the doctor's target (never outside 1..5).
        const rating = cancelled ? null : Math.max(1, Math.min(5, Math.round(doctor.targetRating + (random() - 0.6) * 2.2)));
        rows.push({
          patientId,
          doctorId,
          slotStart,
          slotEnd,
          status: cancelled ? "cancelled" : "completed",
          rating: random() < 0.85 ? rating : null,
          reason: reasons[Math.floor(random() * reasons.length)]!,
          checkedInAt: cancelled ? null : new Date(slotStart.getTime() - 10 * 60_000),
          startedAt: cancelled ? null : slotStart,
          completedAt: cancelled ? null : slotEnd,
          cancelledAt: cancelled ? new Date(slotStart.getTime() - 24 * 60 * 60_000) : null,
          cancelledBy: cancelled ? "patient" : null,
        });
      }
    }
  }

  await prisma.appointment.createMany({ data: rows });

  // Ratings are derived, exactly as the app derives them when a patient submits one.
  for (const doctorId of doctorIds.values()) {
    const aggregate = await prisma.appointment.aggregate({
      where: { doctorId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.doctorProfile.update({
      where: { id: doctorId },
      data: { rating: Math.round((aggregate._avg.rating ?? 0) * 100) / 100, ratingCount: aggregate._count.rating },
    });
  }
  return rows.length;
}

/** A couple of upcoming bookings through the real service, so the demo patient has something on the dashboard. */
async function seedUpcoming(doctorIds: Map<string, string>, patientIds: string[]): Promise<number> {
  const upcomingExists = await prisma.appointment.count({ where: { status: "booked", slotStart: { gt: new Date() } } });
  if (upcomingExists > 0) return 0;

  const patient = await prisma.user.findUniqueOrThrow({ where: { id: patientIds[0]! } });
  const policy = currentSlotPolicy();
  const now = new Date();
  let booked = 0;
  const bookedTimes = new Set<number>(); // Track patient's booked slot times to avoid conflicts

  for (const email of ["sarah.chen@mediconnect.test", "priya.patel@mediconnect.test"]) {
    const doctorId = doctorIds.get(email)!;
    const doctor = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctorId }, include: { availability: true } });
    const days = generateSlots({ windows: doctor.availability, policy, now, days: 7, takenStarts: new Set() });
    // Skip today so the demo appointments are not already inside a check-in window; pick the first free slot after.
    // Also skip any times already booked for this patient.
    const slot = days
      .filter((day) => day.date !== toYmd(now, policy.timeZone))
      .flatMap((day) => day.slots)
      .find((s) => s.available && !bookedTimes.has(s.start.getTime()));
    if (!slot) continue;
    await bookAppointment(
      { id: patient.id, role: "patient", name: patient.name },
      { doctorId, slotStart: slot.start, reason: "Annual check-up" },
      now,
    );
    bookedTimes.add(slot.start.getTime());
    booked += 1;
  }
  return booked;
}

async function main(): Promise<void> {
  const { doctorIds, patientIds } = await seedPeople();
  const history = await seedHistory(doctorIds, patientIds);
  const upcoming = await seedUpcoming(doctorIds, patientIds);

  console.log(`Seeded ${DOCTORS.length} doctors, ${PATIENTS.length} patients, 1 admin.`);
  console.log(history > 0 ? `Created ${history} historical appointments.` : "Appointments already present: history untouched.");
  if (upcoming > 0) console.log(`Booked ${upcoming} upcoming appointments for ${PATIENTS[0]!.name}.`);
  console.log(`\nSign in with any seeded email and the password: ${SEED_PASSWORD}`);
  console.log("  admin    admin@mediconnect.test");
  console.log("  doctor   sarah.chen@mediconnect.test");
  console.log("  patient  alex.rivera@mediconnect.test");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
