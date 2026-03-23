import Link from "next/link";
import { HeartPulseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";
import { ClinicTimeProvider } from "@/components/clinic-time";
import { config } from "@/lib/config";
import { ROLE_HOME, type RoleName } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { logoutAction } from "@/features/auth/actions";
import { LiveEventsProvider } from "@/features/appointments/components/live-events-provider";
import { LiveIndicator } from "@/features/appointments/components/live-indicator";
import { NotificationBell } from "@/features/notifications/components/notification-bell";

const NAV: Record<RoleName, { href: string; label: string }[]> = {
  patient: [
    { href: "/patient/dashboard", label: "Dashboard" },
    { href: "/patient/doctors", label: "Find a doctor" },
  ],
  doctor: [
    { href: "/doctor/dashboard", label: "Dashboard" },
    { href: "/doctor/schedule", label: "Schedule" },
  ],
  admin: [
    { href: "/admin/overview", label: "Overview" },
    { href: "/admin/doctors", label: "Doctors" },
  ],
};

const ROLE_LABEL: Record<RoleName, string> = { patient: "Patient", doctor: "Doctor", admin: "Admin" };

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <ClinicTimeProvider timeZone={config.clinicTimezone}>
      <LiveEventsProvider>
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
              <Link href={ROLE_HOME[user.role]} className="flex items-center gap-2 font-semibold tracking-tight">
                <HeartPulseIcon className="size-5 text-primary" aria-hidden="true" />
                MediConnect
              </Link>
              <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
                {NAV[user.role].map((link) => (
                  <NavLink key={link.href} href={link.href}>
                    {link.label}
                  </NavLink>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                <LiveIndicator className="hidden sm:inline-flex" />
                {user.role === "admin" ? null : <NotificationBell role={user.role} />}
                <div className="hidden text-right leading-tight sm:block">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
                </div>
                <form action={logoutAction}>
                  <Button type="submit" variant="outline" size="sm">
                    Sign out
                  </Button>
                </form>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
        </div>
      </LiveEventsProvider>
    </ClinicTimeProvider>
  );
}
