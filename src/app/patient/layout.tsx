import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/session";

// Second gate behind the middleware: the layout re-checks the session and role on every render.
export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("patient");
  return <AppShell user={user}>{children}</AppShell>;
}
