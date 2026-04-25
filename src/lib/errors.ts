export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "SLOT_UNAVAILABLE"
  | "SLOT_TAKEN"
  | "PATIENT_CONFLICT"
  | "INVALID_TRANSITION"
  | "CHECKIN_CLOSED"
  | "DOCTOR_BUSY"
  | "RATE_LIMITED"
  | "CONFLICT";

/** Expected, user-presentable failure. Anything else is a bug and is reported generically. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown, code?: AppErrorCode): error is AppError {
  return error instanceof AppError && (code === undefined || error.code === code);
}
