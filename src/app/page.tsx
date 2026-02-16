import { redirect } from "next/navigation";
import { CalendarClockIcon, HeartPulseIcon, MessageCircleIcon, RadioIcon } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { ROLE_HOME } from "@/lib/roles";
import { getSessionUser } from "@/lib/session";

const FEATURES = [
  { icon: CalendarClockIcon, title: "Book in seconds", body: "Pick a specialty, choose an open slot, and it is yours. Slots can never be double-booked." },
  { icon: RadioIcon, title: "Live queue", body: "Check in and watch your place in line update in real time, without refreshing." },
  { icon: MessageCircleIcon, title: "Message your care team", body: "A private thread for every appointment, with read receipts and instant delivery." },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect(ROLE_HOME[user.role]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <HeartPulseIcon className="size-5 text-primary" aria-hidden="true" />
          MediConnect
        </span>
        <LinkButton href="/login" variant="outline" size="sm">
          Sign in
        </LinkButton>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-12 py-12">
        <section className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            See a doctor without the waiting-room guesswork.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Book an appointment, join a live queue, and stay in touch with your care team, all in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/register" size="lg" className="h-10 px-5 text-base">
              Create a patient account
            </LinkButton>
            <LinkButton href="/login" variant="outline" size="lg" className="h-10 px-5 text-base">
              Sign in
            </LinkButton>
          </div>
        </section>

        <section aria-label="Features" className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="grid gap-2">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
