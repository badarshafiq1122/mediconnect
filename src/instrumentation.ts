export async function register(): Promise<void> {
  // Node runtime only: the scheduler needs Prisma and timers, neither of which exist on the Edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_REMINDER_SCHEDULER === "true") return;

  const { startReminderScheduler } = await import("@/features/appointments/reminders");
  startReminderScheduler();
}
