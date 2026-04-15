# MediConnect build progress

Resume protocol: read this file first, continue at the first unchecked item.

## Decisions (one line each)
- npm (not pnpm) as package manager; Prisma 6.19 (`prisma-client-js`), Zod 4, Auth.js v5 beta, bcryptjs (pure JS, cost 12).
- Route groups `(patient)/dashboard` and `(doctor)/dashboard` would collide on the same URL, so role areas use real prefixes: /patient, /doctor, /admin.
- App port 3100 (dev/start), e2e port 3101; DBs: mediconnect, mediconnect_test, mediconnect_e2e (all local, user `dev`, no password).
- Slots are 30 min, interpreted in CLINIC_TIMEZONE (default UTC); booking lead time 15 min; check-in opens 60 min before slot.
- Base UI (shadcn base-nova): use `render={<Link/>}` not `asChild`; `cn` comes from the shadcn `cn` package (intentional).
- Queue order is FIFO by check-in time (positions only ever improve); per-doctor row lock (`FOR UPDATE`) serialises queue mutations.
- Extra columns beyond spec: Appointment(reason, notes, checkedInAt, startedAt, completedAt, reminderSentAt, rating), DoctorProfile(isActive, ratingCount), Notification model.

## Todo
- [x] 0. Scaffold
- [x] 1. Schema, migration (partial unique indexes + CHECKs), seed
- [x] 2. Auth (service, actions, forms, middleware, pages)
- [x] 3. Doctors (discovery, cursor pagination, slot picker, admin service)
- [x] 4. Appointments (booking tx + constraint, queue, transitions, SSE, notifications, reminders)
- [x] 5. Messaging (thread, sanitize, read receipts, dynamic widget)
- [x] 6. Doctor dashboard, schedule, availability, notes, history
- [x] 7. Admin (doctor management, overview + validated volume chart)
- [x] 8. Unit + integration tests: 16 files / 237 tests green
- [x] 9. e2e: 14 Playwright tests green
- [x] 10. README + SUMMARY.md written

Build complete. See SUMMARY.md.
