import { describe, expect, it } from "vitest";
import { callbackToPath, safeRedirectPath } from "@/features/auth/redirect";
import {
  addDaysToYmd,
  dayOfWeekOfYmd,
  formatHhmm,
  minutesOfDay,
  toYmd,
  zonedTimeToInstant,
} from "@/lib/time";

describe("safeRedirectPath (open-redirect guard)", () => {
  it.each(["/patient/dashboard", "/doctor/appointments/abc?x=1", "/"])("accepts %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "//evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/\\evil.com",
    "patient/dashboard",
    "/login",
    "/register",
    "",
    "/ok\nHeader: injected",
    42,
    null,
    undefined,
  ])("rejects %j", (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });
});

describe("callbackToPath (Auth.js absolute callbackUrl)", () => {
  const own = ["http://localhost:3100", "https://app.example.com"];

  it("reduces a same-origin absolute URL to a path, keeping the query", () => {
    expect(callbackToPath("http://localhost:3100/patient/dashboard?x=1", own)).toBe("/patient/dashboard?x=1");
    expect(callbackToPath("https://app.example.com/doctor/schedule", own)).toBe("/doctor/schedule");
  });

  it("still accepts plain safe paths", () => {
    expect(callbackToPath("/admin/overview", own)).toBe("/admin/overview");
  });

  it.each([
    "https://evil.com/patient/dashboard",
    "http://localhost:3100.evil.com/x",
    "http://localhost:9999/x",
    "javascript:alert(1)",
    "//evil.com",
    "not a url",
    "http://localhost:3100/login",
  ])("rejects %s", (value) => {
    expect(callbackToPath(value, own)).toBeNull();
  });

  it("rejects non-strings and an empty origin list for absolute URLs", () => {
    expect(callbackToPath(undefined, own)).toBeNull();
    expect(callbackToPath("http://localhost:3100/x", [])).toBeNull();
  });
});

describe("time helpers", () => {
  it("round-trips HH:mm and minutes", () => {
    expect(minutesOfDay("09:30")).toBe(570);
    expect(formatHhmm(570)).toBe("09:30");
    expect(formatHhmm(0)).toBe("00:00");
  });

  it("rejects malformed times", () => {
    expect(() => minutesOfDay("9:30")).toThrow();
    expect(() => minutesOfDay("24:00")).toThrow();
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysToYmd("2030-01-31", 1)).toBe("2030-02-01");
    expect(addDaysToYmd("2030-12-31", 1)).toBe("2031-01-01");
    expect(addDaysToYmd("2030-03-01", -1)).toBe("2030-02-28");
  });

  it("computes the weekday of a calendar date", () => {
    expect(dayOfWeekOfYmd("2030-01-07")).toBe(1); // Monday
    expect(dayOfWeekOfYmd("2030-01-06")).toBe(0); // Sunday
  });

  it("converts a clinic wall-clock time to the right UTC instant", () => {
    expect(zonedTimeToInstant("2030-01-07", "09:00", "UTC").toISOString()).toBe("2030-01-07T09:00:00.000Z");
    expect(zonedTimeToInstant("2030-01-07", "09:00", "Asia/Tokyo").toISOString()).toBe("2030-01-07T00:00:00.000Z");
  });

  it("sees the local calendar date, which can differ from the UTC date", () => {
    const instant = new Date("2030-01-07T23:30:00Z");
    expect(toYmd(instant, "UTC")).toBe("2030-01-07");
    expect(toYmd(instant, "Asia/Tokyo")).toBe("2030-01-08");
  });
});
