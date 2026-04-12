# MediConnect 🏥

A modern, full-stack telehealth platform that connects patients with healthcare providers through seamless appointment booking, real-time queue management, and secure messaging.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue?style=flat-square&logo=postgresql)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma)

## ✨ Features

### For Patients
- 🔍 **Doctor Discovery** - Browse doctors by specialty with ratings and availability
- 📅 **Smart Booking** - Book appointments with real-time slot availability
- ⏱️ **Live Queue** - Join virtual waiting room and see your position in real-time
- 💬 **Secure Messaging** - Chat with doctors during appointments
- 🔔 **Notifications** - Get reminders and updates about appointments
- ⭐ **Rate & Review** - Provide feedback on completed consultations

### For Doctors
- 📊 **Dashboard** - Overview of today's appointments and queue
- 🗓️ **Schedule Management** - Set weekly availability windows
- 👥 **Live Waiting Room** - Manage patient queue in real-time
- 💬 **Patient Communication** - Message patients during appointments
- 📝 **Clinical Notes** - Private notes for each consultation
- ⏯️ **Appointment Controls** - Start, complete, or manage consultations

### For Administrators
- 🎛️ **Platform Overview** - Monitor users, appointments, and system health
- 👨‍⚕️ **Doctor Management** - Create, activate, and manage doctor profiles
- 📈 **Analytics** - View appointment volumes and platform metrics

## 🚀 Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Components, Server Actions)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Database**: [PostgreSQL](https://www.postgresql.org/) 18+
- **ORM**: [Prisma](https://www.prisma.io/) 6
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) v5 (Credentials provider)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Real-time**: Server-Sent Events (SSE)
- **Validation**: [Zod](https://zod.dev/)
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)

## 📋 Prerequisites

- **Node.js** 22+ (built on 24)
- **npm** or **yarn**
- **PostgreSQL** 14+ (tested on 18)
- **Git**

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/badarshafiq1122/mediconnect.git
cd mediconnect
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and set the required variables:

```env
# Database
DATABASE_URL="postgresql://dev@localhost:5432/mediconnect?schema=public"

# Auth (generate with: openssl rand -base64 32)
AUTH_SECRET="your-secret-here"
AUTH_URL="http://localhost:3100"
AUTH_TRUST_HOST="true"

# App Settings
PORT=3100
CLINIC_TIMEZONE="UTC"
```

### 4. Set up the database

```bash
# Create databases (main, test, e2e)
npm run db:setup

# Apply migrations
npm run db:deploy

# Seed with demo data
npm run db:seed
```

### 5. Start the development server

```bash
npm run dev
```

Visit **http://localhost:3100** 🎉

## 🔐 Demo Accounts

All demo accounts use the password: **`Password123!`**

| Role | Email | Description |
|------|-------|-------------|
| **Patient** | `alex.rivera@mediconnect.test` | View and book appointments |
| **Doctor** | `sarah.chen@mediconnect.test` | Manage schedule and queue |
| **Admin** | `admin@mediconnect.test` | Platform administration |

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3100 |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript compiler check |
| `npm test` | Run all tests (unit + integration) |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests |
| `npm run test:e2e` | Run end-to-end tests with Playwright |
| `npm run db:setup` | Create databases (idempotent) |
| `npm run db:migrate` | Create and apply new migration |
| `npm run db:deploy` | Apply all migrations |
| `npm run db:seed` | Seed database with demo data |
| `npm run db:reset` | Reset database (drop, migrate, seed) |

## 🏗️ Project Structure

```
mediconnect/
├── prisma/
│   ├── migrations/          # Database migrations
│   ├── schema.prisma        # Prisma schema
│   └── seed.ts             # Seed script
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (auth)/         # Auth pages (login, register)
│   │   ├── patient/        # Patient portal
│   │   ├── doctor/         # Doctor dashboard
│   │   ├── admin/          # Admin panel
│   │   └── api/            # API routes (SSE, REST)
│   ├── components/         # Shared UI components
│   │   └── ui/            # shadcn/ui primitives
│   ├── features/          # Feature modules
│   │   ├── appointments/  # Booking, queue, lifecycle
│   │   ├── auth/          # Authentication logic
│   │   ├── doctors/       # Doctor queries & actions
│   │   ├── messaging/     # Patient-doctor chat
│   │   ├── notifications/ # Notification system
│   │   └── admin/         # Admin operations
│   ├── lib/               # Utilities
│   │   ├── prisma.ts      # Prisma client
│   │   ├── auth.ts        # NextAuth config
│   │   ├── sse-bus.ts     # Real-time event bus
│   │   ├── config.ts      # App configuration
│   │   └── time.ts        # Date/time utilities
│   └── middleware.ts      # Route protection
├── tests/
│   ├── unit/              # Pure logic tests
│   ├── integration/       # Database integration tests
│   └── e2e/               # Playwright E2E tests
└── scripts/
    └── create-databases.sh # Database setup script
```

## 🔒 Security Features

- ✅ **bcrypt** password hashing (cost factor 12)
- ✅ **Constant-time** login (prevents email enumeration)
- ✅ **Rate limiting** on login, registration, and messaging
- ✅ **Session-based** authentication with NextAuth.js
- ✅ **Role-based** access control (patient/doctor/admin)
- ✅ **Input validation** with Zod schemas
- ✅ **XSS protection** (text-only message rendering)
- ✅ **SQL injection** prevention via Prisma ORM
- ✅ **CSRF protection** built into Next.js Server Actions

## 🎯 Key Features Explained

### 📅 Appointment Booking

- **No double-booking**: Enforced by database constraints (partial unique indexes)
- **Smart slot generation**: Based on doctor availability and clinic timezone
- **Booking lead time**: Configurable minimum booking window
- **Automatic reminders**: Background job sends notifications before appointments

### ⏱️ Real-time Queue System

- **Live updates**: Server-Sent Events (SSE) for real-time notifications
- **FIFO ordering**: Queue positions maintained with database-level locking
- **Automatic reconnection**: Client handles disconnects gracefully
- **Fallback polling**: 30-second polls when SSE unavailable

### 💬 Messaging

- **Appointment-scoped**: Messages tied to specific appointments
- **Read receipts**: Track when messages are read
- **Real-time delivery**: Instant updates via SSE
- **Secure storage**: Sanitized before database storage

### 🧪 Testing

- **Unit tests**: Pure business logic (slots, validation, queue)
- **Integration tests**: Database operations with real Postgres
- **E2E tests**: Full user flows with Playwright
- **Test isolation**: Separate databases for each test type

## 🌍 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `AUTH_SECRET` | NextAuth.js secret key | Required |
| `AUTH_URL` | Application URL | `http://localhost:3100` |
| `PORT` | Server port | `3100` |
| `CLINIC_TIMEZONE` | IANA timezone for availability | `UTC` |
| `SLOT_MINUTES` | Appointment duration | `30` |
| `BOOKING_LEAD_MINUTES` | Min booking advance time | `15` |
| `CHECKIN_OPENS_MINUTES` | Check-in window before slot | `60` |
| `REMINDER_LEAD_MINUTES` | Reminder timing before slot | `30` |

## 🚦 Production Deployment

### Database Migrations

```bash
# Apply all pending migrations
npm run db:deploy
```

### Build & Start

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Environment Setup

1. Set `NODE_ENV=production`
2. Use strong `AUTH_SECRET` (min 32 bytes)
3. Configure production database URL
4. Set appropriate `CLINIC_TIMEZONE`
5. Consider Redis for SSE bus scaling (see `src/lib/sse-bus.ts`)

## 🤝 Contributing

This is a portfolio project, but suggestions and feedback are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Author

**Badar Shafiq**
- GitHub: [@badarshafiq1122](https://github.com/badarshafiq1122)
- Email: badarshafiq1122@gmail.com

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Inspired by modern telehealth platforms

---

**⭐ If you found this project helpful, please consider giving it a star!**
