# MediConnect build summary

Status: **all specified features are built and verified.** Last full run: lint clean, `tsc --noEmit` clean,
**237 Vitest tests** (135 unit + 102 integration on real Postgres) and **14 Playwright e2e tests** all passing,
production build succeeds.

## Run it locally

```bash
cd mediconnect
npm install
cp .env.example .env               # set AUTH_SECRET (openssl rand -base64 32); .env already exists on this machine
npm run db:setup && npm run db:deploy && npm run db:seed
npm run dev                        # http://localhost:3100   (patient: alex.rivera@mediconnect.test / Password123!)

npm test                           # unit + integration (needs mediconnect_test; auto-migrated)
npx playwright install chromium    # once
npm run test:e2e                   # resets mediconnect_e2e, builds, serves :3101, runs Chromium
```

Seed logins (password `Password123!`): patient `alex.rivera@mediconnect.test`, doctor `sarah.chen@mediconnect.test`,
admin `admin@mediconnect.test`.

## What is fully done

| Spec item | Where / how it is verified |
| --- | --- |
| Auth: email/password, roles, JWT sessions | Auth.js v5 credentials; middleware + layout + action/route re-checks. Integration (auth) + e2e (role boundaries, redirects, callback URL) |
| Rate-limited login, bcrypt cost 12 | Per (IP, account) and per-IP throttles inside `authorize`; register + message throttles. Unit + integration + e2e lockout |
| Doctor discovery: specialty / availability / rating, cursor pagination | `/patient/doctors` (URL-driven GET form). Integration: filters, 25 doctors paged exactly once with rating ties |
| Slot booking, no double-booking **at the DB level** | Partial unique indexes + `$transaction`; error mapped from `P2002`. Integration: 8 concurrent bookers → 1 winner; direct-insert bypass rejected; e2e two-browser race |
| Live queue via **SSE** (no polling) with 30 s TanStack Query fallback | `/api/sse/queue` + `EventSource` provider. e2e asserts cross-user updates within 10 s while both tabs are "Live" |
| Secure per-appointment messaging | Participants only (404 otherwise), sanitised, rate-limited, read receipts, live. Integration + e2e |
| Doctor dashboard: schedule, history, notes | Live waiting room, today's schedule, visit history, private notes, availability editor |
| In-app notifications: confirmed / cancelled / reminder over the same SSE channel | Persisted `Notification` rows + live push + bell/toasts. Reminders are idempotent (integration) |
| Admin: manage doctors, platform appointment volume | Create/edit/deactivate doctors, weekly hours, overview KPIs + stacked volume chart (validated palette, tooltip, table view) |
| Tests: unit + real-DB integration + e2e | As above |

Also: seed script, security headers, error/404/loading states, README with architecture and migration commands.

## Decisions and deviations (logged, not asked)

- **URL layout:** `/patient/*`, `/doctor/*`, `/admin/*` instead of route groups; `(patient)/dashboard` and `(doctor)/dashboard` would collide on `/dashboard`.
- **Extras beyond the data model:** `Notification` model; appointment `reason/notes/rating/timestamps/reminderSentAt`; `DoctorProfile.isActive/ratingCount`; a second partial index preventing one patient holding two live appointments at the same instant; CHECK constraints (queue position ⇔ `in_queue`, valid times, ranges).
- **Queue order** is FIFO by check-in time, re-ranked under a per-doctor row lock. Ratings are derived from patient ratings.
- **Time:** 30-minute slots, interpreted in `CLINIC_TIMEZONE` (default `UTC`); 15 min booking lead; check-in opens 60 min before. All configurable.
- `bcryptjs` (pure JS) rather than native `bcrypt`; Prisma 6.19 (latest 6.x) rather than the 7/8 line; Zod 4; Vitest 5 (`@types/node` aligned to 24 to satisfy its peer range).
- The `cn` package that shadcn added is the official shadcn helper (verified), not a typosquat.

## Bugs found and fixed by the tests (worth knowing)

- Rate limiter off-by-one: the Nth allowed event was refused (would have allowed 9 sign-ups/hour and 29 messages/minute instead of 10 and 30).
- Queue positions could momentarily disagree with FIFO order under a check-in race; positions are now always re-ranked.
- `LinkButton` rendered `<a role="button">` (Base UI); now a real link.
- A failed booking closed the panel that held its error message.
- Auth.js sends absolute `callbackUrl`s, which the open-redirect guard rejected; now accepted only for the app's own origin.

## Partial / known limits

- **Single-instance:** SSE bus and rate limiters are in memory (swap points are commented for Redis). Reminders run on an in-process timer.
- **No Content-Security-Policy** (needs a per-request nonce). Other security headers are set.
- **`npm audit`: 5 findings, all transitive, none reachable at runtime here:** `deepmerge-ts` inside the Prisma CLI's config loader, and the PostCSS copy bundled in Next (only processes this repo's own CSS). Their "fixes" are a Prisma downgrade and a Next 16 major upgrade, so they were not force-applied.
- Build prints an Edge-runtime warning from `jose` (`DecompressionStream`) inside the Auth.js middleware bundle: known, harmless for next-auth v5 beta.
- Prisma prints a deprecation notice for `package.json#prisma` (seed config); migrate to `prisma.config.ts` when moving to Prisma 7.
- Dark mode follows the OS setting (no toggle). Light mode and a mobile patient dashboard were checked in screenshots; dark mode was checked only via the palette validator, not visually.

## Not built

Video calling; email/SMS delivery of notifications (in-app only); password reset/change and email verification; appointment rescheduling; audit logging and other compliance features; automated accessibility scanning; frontend component unit tests (the spec asked for unit tests of logic, which exist).
