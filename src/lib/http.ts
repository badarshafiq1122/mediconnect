import { NextResponse } from "next/server";
import { AppError, type AppErrorCode } from "@/lib/errors";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  SLOT_UNAVAILABLE: 409,
  SLOT_TAKEN: 409,
  PATIENT_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  CHECKIN_CLOSED: 409,
  DOCTOR_BUSY: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

/** JSON error response for route handlers. Unexpected errors are logged and never leak details. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS_BY_CODE[error.code] });
  }
  console.error("Unhandled route handler error", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Authenticated per-user data must never be cached by the browser or an intermediary. */
export const NO_STORE = { "Cache-Control": "no-store" } as const;
