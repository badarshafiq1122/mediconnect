import Link from "next/link";
import { HeartPulseIcon } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <HeartPulseIcon className="size-6 text-primary" aria-hidden="true" />
        MediConnect
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
