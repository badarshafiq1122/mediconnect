import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("admin");
  return <AppShell user={user}>{children}</AppShell>;
}
