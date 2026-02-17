-- CreateEnum
CREATE TYPE "Role" AS ENUM ('patient', 'doctor', 'admin');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'in_queue', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('appointment_confirmed', 'appointment_cancelled', 'appointment_reminder');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'patient',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "slot_start" TIMESTAMP(3) NOT NULL,
    "slot_end" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'booked',
    "queue_position" INTEGER,
    "reason" TEXT,
    "notes" TEXT,
    "rating" INTEGER,
    "checked_in_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" "Role",
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "appointment_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_user_id_key" ON "DoctorProfile"("user_id");

-- CreateIndex
CREATE INDEX "DoctorProfile_specialty_idx" ON "DoctorProfile"("specialty");

-- CreateIndex
CREATE INDEX "DoctorProfile_is_active_rating_id_idx" ON "DoctorProfile"("is_active", "rating" DESC, "id");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_day_of_week_idx" ON "AvailabilitySlot"("day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_doctor_id_day_of_week_start_time_key" ON "AvailabilitySlot"("doctor_id", "day_of_week", "start_time");

-- CreateIndex
CREATE INDEX "Appointment_patient_id_idx" ON "Appointment"("patient_id");

-- CreateIndex
CREATE INDEX "Appointment_doctor_id_slot_start_idx" ON "Appointment"("doctor_id", "slot_start");

-- CreateIndex
CREATE INDEX "Appointment_status_slot_start_idx" ON "Appointment"("status", "slot_start");

-- CreateIndex
CREATE INDEX "Message_appointment_id_sent_at_idx" ON "Message"("appointment_id", "sent_at");

-- CreateIndex
CREATE INDEX "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "Notification_user_id_read_at_idx" ON "Notification"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (Prisma cannot express partial indexes / CHECKs).
-- ---------------------------------------------------------------------------

-- NO DOUBLE-BOOKING: at most one live appointment per doctor per slot start.
-- Cancelled/completed rows are excluded so a cancelled slot can be rebooked.
-- Booking relies on this index rejecting the second INSERT; there is no check-then-insert in app code.
CREATE UNIQUE INDEX "Appointment_doctor_slot_active_key"
  ON "Appointment"(doctor_id, slot_start)
  WHERE status IN ('booked', 'in_queue', 'in_progress');

-- A patient cannot be in two live consultations at the same instant.
CREATE UNIQUE INDEX "Appointment_patient_slot_active_key"
  ON "Appointment"(patient_id, slot_start)
  WHERE status IN ('booked', 'in_queue', 'in_progress');

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_slot_order_check" CHECK (slot_end > slot_start);

-- queue_position is set if and only if the appointment is currently in the queue.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_queue_position_check" CHECK (
    (status = 'in_queue' AND queue_position IS NOT NULL AND queue_position >= 1)
    OR (status <> 'in_queue' AND queue_position IS NULL)
  );

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_rating_range_check" CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

ALTER TABLE "DoctorProfile"
  ADD CONSTRAINT "DoctorProfile_rating_range_check" CHECK (rating >= 0 AND rating <= 5);

ALTER TABLE "AvailabilitySlot"
  ADD CONSTRAINT "AvailabilitySlot_day_check" CHECK (day_of_week BETWEEN 0 AND 6);

ALTER TABLE "AvailabilitySlot"
  ADD CONSTRAINT "AvailabilitySlot_time_check" CHECK (
    start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND start_time < end_time
  );
