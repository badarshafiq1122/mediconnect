import Link from "next/link";
import { StarIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/link-button";
import { DAY_NAMES } from "@/lib/time";
import type { DoctorCardDTO } from "@/features/doctors/queries";

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function RatingLabel({ rating, count }: { rating: number; count: number }) {
  if (count === 0) return <span className="text-sm text-muted-foreground">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${count} reviews`}>
      <StarIcon className="size-4 fill-status-warning text-status-warning" aria-hidden="true" />
      <span className="font-medium">{rating.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}

export function DoctorCard({ doctor }: { doctor: DoctorCardDTO }) {
  return (
    <Card data-testid="doctor-card">
      <CardContent className="grid h-full content-between gap-4">
        <div className="grid gap-3">
          <div className="flex items-start gap-3">
            <Avatar size="lg">
              <AvatarFallback>{initials(doctor.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-1">
              <Link href={`/patient/doctors/${doctor.id}`} className="truncate font-medium hover:underline">
                {doctor.name}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{doctor.specialty}</Badge>
                <RatingLabel rating={doctor.rating} count={doctor.ratingCount} />
              </div>
            </div>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{doctor.bio || "No biography provided."}</p>
          <p className="text-xs text-muted-foreground">
            {doctor.availableDays.length > 0
              ? `Available ${doctor.availableDays.map((day) => DAY_NAMES[day]!.slice(0, 3)).join(", ")}`
              : "No availability set"}
          </p>
        </div>
        <LinkButton href={`/patient/doctors/${doctor.id}`} variant="outline" className="w-full">
          View availability
        </LinkButton>
      </CardContent>
    </Card>
  );
}
