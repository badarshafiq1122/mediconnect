import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/session";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("doctor");
  return <AppShell user={user}>{children}</AppShell>;
}
