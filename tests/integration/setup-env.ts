import { testDatabaseUrl } from "./test-database";

// Runs in every test worker before any application module is imported, so PrismaClient binds to the test DB.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.CLINIC_TIMEZONE = "UTC";
process.env.SLOT_MINUTES = "30";
process.env.BOOKING_LEAD_MINUTES = "15";
process.env.CHECKIN_OPENS_MINUTES = "60";
process.env.REMINDER_LEAD_MINUTES = "30";
